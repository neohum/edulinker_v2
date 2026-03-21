package notify

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// MessageType defines the kind of WebSocket message.
type MessageType string

const (
	MsgTypeChat         MessageType = "chat"
	MsgTypeNotification MessageType = "notification"
	MsgTypeAlert        MessageType = "alert"
	MsgTypeSystem       MessageType = "system"
	MsgTypePluginEvent  MessageType = "plugin_event"
)

// WSMessage is the envelope sent over WebSocket connections.
type WSMessage struct {
	Type     MessageType `json:"type"`
	Payload  interface{} `json:"payload"`
	From     uuid.UUID   `json:"from,omitempty"`
	To       []uuid.UUID `json:"to,omitempty"`      // empty = broadcast
	Channel  string      `json:"channel,omitempty"` // Redis Pub/Sub channel
	PluginID string      `json:"plugin_id,omitempty"`
}

// Client represents a single WebSocket connection.
type Client struct {
	ID       uuid.UUID
	SchoolID uuid.UUID
	Role     string
	Conn     *websocket.Conn
	Send     chan []byte
}

// Hub manages all WebSocket client connections and message routing.
type Hub struct {
	// Registered clients keyed by user ID
	clients map[uuid.UUID]*Client
	mu      sync.RWMutex

	// Channels for registration lifecycle
	register   chan *Client
	unregister chan *Client

	// Inbound messages from clients
	broadcast chan *WSMessage

	// Redis for cross-server Pub/Sub
	rdb    *redis.Client
	ctx    context.Context
	cancel context.CancelFunc
}

// NewHub creates a new WebSocket Hub.
func NewHub(rdb *redis.Client) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	return &Hub{
		clients:    make(map[uuid.UUID]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *WSMessage, 256),
		rdb:        rdb,
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Run starts the hub's main event loop. Should be called in a goroutine.
func (h *Hub) Run() {
	// Subscribe to Redis Pub/Sub for cross-server messaging
	if h.rdb != nil {
		go h.subscribeRedis()
	}

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("🔌 WS client connected: %s (school: %s)", client.ID, client.SchoolID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("🔌 WS client disconnected: %s", client.ID)

		case msg := <-h.broadcast:
			h.routeMessage(msg)

		case <-h.ctx.Done():
			return
		}
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// Broadcast sends a message through the hub.
func (h *Hub) Broadcast(msg *WSMessage) {
	h.broadcast <- msg
}

// SendToUser sends a message to a specific user.
func (h *Hub) SendToUser(userID uuid.UUID, msg *WSMessage) {
	h.mu.RLock()
	client, ok := h.clients[userID]
	h.mu.RUnlock()

	if ok {
		data, _ := json.Marshal(msg)
		select {
		case client.Send <- data:
		default:
			// Client buffer full — drop message
			log.Printf("⚠️ WS buffer full for user %s, dropping message", userID)
		}
	} else if h.rdb != nil {
		// User not on this server — publish to Redis for other servers
		h.publishRedis(msg)
	}
}

// SendToSchool broadcasts a message to all connected users of a school.
func (h *Hub) SendToSchool(schoolID uuid.UUID, msg *WSMessage) {
	data, _ := json.Marshal(msg)

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, client := range h.clients {
		if client.SchoolID == schoolID {
			select {
			case client.Send <- data:
			default:
			}
		}
	}
}

// OnlineCount returns the number of connected clients.
func (h *Hub) OnlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Stop gracefully shuts down the hub.
func (h *Hub) Stop() {
	h.cancel()
}

// ── Internal ──

func (h *Hub) routeMessage(msg *WSMessage) {
	data, _ := json.Marshal(msg)

	if len(msg.To) > 0 {
		// Targeted message — send only to specified users
		h.mu.RLock()
		log.Printf("📨 WS routing to %d recipients, connected clients: %d", len(msg.To), len(h.clients))
		for _, targetID := range msg.To {
			if client, ok := h.clients[targetID]; ok {
				select {
				case client.Send <- data:
					log.Printf("✅ WS delivered to %s", targetID)
				default:
					log.Printf("⚠️ WS buffer full for %s", targetID)
				}
			} else {
				log.Printf("❌ WS client not found: %s", targetID)
			}
		}
		h.mu.RUnlock()
	} else {
		// Broadcast to all
		h.mu.RLock()
		for _, client := range h.clients {
			select {
			case client.Send <- data:
			default:
			}
		}
		h.mu.RUnlock()
	}

	// Also publish to Redis for cross-server delivery
	if h.rdb != nil {
		h.publishRedis(msg)
	}
}

func (h *Hub) publishRedis(msg *WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	channel := "edulinker:ws"
	if msg.Channel != "" {
		channel = msg.Channel
	}
	h.rdb.Publish(h.ctx, channel, data)
}

func (h *Hub) subscribeRedis() {
	sub := h.rdb.Subscribe(h.ctx, "edulinker:ws")
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case redisMsg, ok := <-ch:
			if !ok {
				return
			}
			var msg WSMessage
			if err := json.Unmarshal([]byte(redisMsg.Payload), &msg); err != nil {
				continue
			}
			// Deliver to local clients only (avoid re-publish loop)
			data, _ := json.Marshal(&msg)
			h.mu.RLock()
			if len(msg.To) > 0 {
				for _, targetID := range msg.To {
					if client, ok := h.clients[targetID]; ok {
						select {
						case client.Send <- data:
						default:
						}
					}
				}
			}
			h.mu.RUnlock()

		case <-h.ctx.Done():
			return
		}
	}
}

// WritePump sends messages from the hub to a single client's WebSocket connection.
// Should be called in a goroutine per client.
func WritePump(client *Client) {
	defer client.Conn.Close()
	for msg := range client.Send {
		if err := client.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}

// ReadPump reads messages from a client's WebSocket and forwards them to the hub.
// Should be called in a goroutine per client.
func ReadPump(client *Client, hub *Hub) {
	defer func() {
		hub.Unregister(client)
		client.Conn.Close()
	}()

	for {
		_, data, err := client.Conn.ReadMessage()
		if err != nil {
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		msg.From = client.ID
		hub.Broadcast(&msg)
	}
}
