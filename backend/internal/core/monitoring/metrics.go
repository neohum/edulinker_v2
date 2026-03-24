package monitoring

import (
	"strconv"
	"time"

	"github.com/gofiber/adaptor/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	// HTTPRequestsTotal counts the total number of HTTP requests.
	HTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests.",
		},
		[]string{"method", "path", "status"},
	)

	// HTTPRequestDurationSeconds tracks the duration of HTTP requests.
	HTTPRequestDurationSeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Duration of HTTP requests in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	// WSConnectionsActive tracks the number of active WebSocket connections.
	WSConnectionsActive = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "ws_connections_active",
			Help: "Number of active WebSocket connections.",
		},
	)

	// PluginRequestsTotal counts the total number of plugin requests.
	PluginRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "plugin_requests_total",
			Help: "Total number of plugin requests.",
		},
		[]string{"plugin_id", "method"},
	)

	// DBQueryDurationSeconds tracks the duration of database queries.
	DBQueryDurationSeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "db_query_duration_seconds",
			Help:    "Duration of database queries in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"operation"},
	)
)

func init() {
	prometheus.MustRegister(
		HTTPRequestsTotal,
		HTTPRequestDurationSeconds,
		WSConnectionsActive,
		PluginRequestsTotal,
		DBQueryDurationSeconds,
	)
}

// PrometheusMiddleware returns a Fiber middleware that records request count and duration.
func PrometheusMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Response().StatusCode())
		method := c.Method()
		path := c.Route().Path

		HTTPRequestsTotal.WithLabelValues(method, path, status).Inc()
		HTTPRequestDurationSeconds.WithLabelValues(method, path).Observe(duration)

		return err
	}
}

// MetricsHandler returns a Fiber handler that serves the Prometheus /metrics endpoint.
func MetricsHandler() fiber.Handler {
	return adaptor.HTTPHandler(promhttp.Handler())
}
