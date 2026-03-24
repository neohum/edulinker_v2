import { useState, useEffect, useRef } from 'react';
import { useNetwork } from '../hooks/useNetwork';
import { API_BASE } from '../api';

export default function NetworkBanner() {
    const { isOnline, serverOnline, isFullyOnline } = useNetwork();
    const [isRetrying, setIsRetrying] = useState(false);
    const backoffRef = useRef(1000); // Start with 1s
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Reset backoff when fully online
    useEffect(() => {
        if (isFullyOnline) {
            backoffRef.current = 1000;
            setIsRetrying(false);
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        }
    }, [isFullyOnline]);

    const doRetry = async () => {
        setIsRetrying(true);
        try {
            // Just a lightweight call to check if server is back
            const res = await fetch(`${API_BASE}/health`);
            if (res.ok) {
                window.dispatchEvent(new Event('server-online'));
                setIsRetrying(false);
                return;
            }
        } catch (e) {
            // Still offline
        }

        // Failed. Apply exponential backoff and schedule next retry automatically (up to 16s max)
        const currentDelay = backoffRef.current;
        const nextDelay = Math.min(currentDelay * 2, 16000);
        backoffRef.current = nextDelay;

        retryTimeoutRef.current = setTimeout(() => {
            doRetry();
        }, currentDelay);
    };

    // Auto-start retry loop when server goes offline
    useEffect(() => {
        if (isOnline && !serverOnline && !isRetrying && backoffRef.current === 1000) {
            doRetry();
        }
    }, [isOnline, serverOnline]);

    if (isFullyOnline) return null;

    const handleManualRetry = () => {
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        backoffRef.current = 1000;
        doRetry();
    };

    const message = !isOnline
        ? '인터넷 연결이 끊어졌습니다. 네트워크 상태를 확인해주세요.'
        : '서버 연결 실패. 자동으로 재시도 중입니다...';

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            backgroundColor: '#ef4444', color: 'white', padding: '12px',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: '16px', fontWeight: 500, boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
            <span>{message}</span>
            {isOnline && !serverOnline && (
                <button
                    onClick={handleManualRetry}
                    disabled={isRetrying && backoffRef.current === 1000}
                    style={{
                        backgroundColor: 'white', color: '#ef4444', border: 'none',
                        padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
                        fontWeight: 'bold', fontSize: '14px', transition: 'all 0.2s'
                    }}
                >
                    즉시 재연결
                </button>
            )}
        </div>
    );
}
