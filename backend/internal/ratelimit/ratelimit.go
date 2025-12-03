package ratelimit

import (
	"sync"
	"time"
)

type Limiter struct {
	rate       float64
	burst      int
	tokens     float64
	lastUpdate time.Time
	mu         sync.Mutex
}

func NewLimiter(rate float64, burst int) *Limiter {
	return &Limiter{
		rate:       rate,
		burst:      burst,
		tokens:     float64(burst),
		lastUpdate: time.Now(),
	}
}

func (l *Limiter) Allow() bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(l.lastUpdate).Seconds()
	l.lastUpdate = now

	l.tokens += elapsed * l.rate
	if l.tokens > float64(l.burst) {
		l.tokens = float64(l.burst)
	}

	if l.tokens >= 1 {
		l.tokens--
		return true
	}

	return false
}

func (l *Limiter) AllowN(n int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(l.lastUpdate).Seconds()
	l.lastUpdate = now

	l.tokens += elapsed * l.rate
	if l.tokens > float64(l.burst) {
		l.tokens = float64(l.burst)
	}

	if l.tokens >= float64(n) {
		l.tokens -= float64(n)
		return true
	}

	return false
}

type ClientLimiters struct {
	limiters        map[string]*Limiter
	rate            float64
	burst           int
	mu              sync.RWMutex
	cleanupInterval time.Duration
	stop            chan struct{}
}

func NewClientLimiters(rate float64, burst int) *ClientLimiters {
	cl := &ClientLimiters{
		limiters:        make(map[string]*Limiter),
		rate:            rate,
		burst:           burst,
		cleanupInterval: 5 * time.Minute,
		stop:            make(chan struct{}),
	}
	go cl.cleanup()
	return cl
}

func (cl *ClientLimiters) Get(clientID string) *Limiter {
	cl.mu.RLock()
	limiter, ok := cl.limiters[clientID]
	cl.mu.RUnlock()

	if ok {
		return limiter
	}

	cl.mu.Lock()
	defer cl.mu.Unlock()

	if limiter, ok := cl.limiters[clientID]; ok {
		return limiter
	}

	limiter = NewLimiter(cl.rate, cl.burst)
	cl.limiters[clientID] = limiter
	return limiter
}

func (cl *ClientLimiters) Remove(clientID string) {
	cl.mu.Lock()
	defer cl.mu.Unlock()
	delete(cl.limiters, clientID)
}

func (cl *ClientLimiters) Stop() {
	close(cl.stop)
}

func (cl *ClientLimiters) cleanup() {
	ticker := time.NewTicker(cl.cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-cl.stop:
			return
		case <-ticker.C:
			cl.mu.Lock()
			if len(cl.limiters) > 10000 {
				cl.limiters = make(map[string]*Limiter)
			}
			cl.mu.Unlock()
		}
	}
}
