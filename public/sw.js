// Enhanced Universal Clipboard Service Worker
const CACHE_NAME = 'universal-clipboard-v2.0.0';
const CLIPBOARD_SYNC_TAG = 'clipboard-sync';

const urlsToCache = [
    '/enhanced.html',
    '/enhanced-styles.css',
    '/enhanced-app.js',
    '/enhanced-manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching app resources');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('📦 Service Worker installed successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('📦 Service Worker install failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('🚀 Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Handle API requests differently
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
        // Don't cache API requests, let them fail naturally when offline
        return;
    }
    
    event.respondWith(
        caches.match(request)
            .then((response) => {
                // Return cached version if available
                if (response) {
                    return response;
                }
                
                // Otherwise fetch from network
                return fetch(request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Cache successful responses for static assets
                        if (request.method === 'GET' && (
                            request.url.includes('.css') ||
                            request.url.includes('.js') ||
                            request.url.includes('.html') ||
                            request.url.includes('.png') ||
                            request.url.includes('.jpg') ||
                            request.url.includes('.ico')
                        )) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(request, responseToCache);
                                });
                        }
                        
                        return response;
                    })
                    .catch(() => {
                        // Return offline fallback for main page
                        if (request.destination === 'document') {
                            return caches.match('/enhanced.html');
                        }
                    });
            })
    );
});

// Background Sync for clipboard updates
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync triggered:', event.tag);
    
    if (event.tag === CLIPBOARD_SYNC_TAG) {
        event.waitUntil(handleClipboardSync());
    }
});

async function handleClipboardSync() {
    console.log('📋 Handling background clipboard sync...');
    
    try {
        // Get all clients (open tabs/windows)
        const clients = await self.clients.matchAll({
            includeUncontrolled: true,
            type: 'window'
        });
        
        // Notify all clients to check for clipboard changes
        clients.forEach(client => {
            client.postMessage({
                type: 'BACKGROUND_CLIPBOARD_CHECK',
                timestamp: Date.now()
            });
        });
        
        console.log(`📋 Notified ${clients.length} clients for clipboard check`);
    } catch (error) {
        console.error('📋 Background clipboard sync failed:', error);
    }
}

// Push notifications for clipboard updates (if supported)
self.addEventListener('push', (event) => {
    console.log('🔔 Push notification received:', event);
    
    const options = {
        body: 'Your clipboard has been updated from another device',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'clipboard-update',
        requireInteraction: false,
        silent: true,
        actions: [
            {
                action: 'view',
                title: 'View Content'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            options.body = `Clipboard updated: ${data.preview}`;
        } catch (error) {
            console.log('Could not parse push data');
        }
    }
    
    event.waitUntil(
        self.registration.showNotification('Universal Clipboard', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event);
    
    event.notification.close();
    
    if (event.action === 'view') {
        // Open or focus the app
        event.waitUntil(
            clients.matchAll({ type: 'window' })
                .then((clientList) => {
                    // Try to focus existing window
                    for (const client of clientList) {
                        if (client.url.includes('/enhanced.html') && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    
                    // Open new window if none exists
                    if (clients.openWindow) {
                        return clients.openWindow('/enhanced.html');
                    }
                })
        );
    }
});

// Message handling from main app
self.addEventListener('message', (event) => {
    console.log('📨 Service Worker received message:', event.data);
    
    const { type, data } = event.data;
    
    switch (type) {
        case 'SCHEDULE_BACKGROUND_SYNC':
            // Schedule background sync for clipboard
            if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
                self.registration.sync.register(CLIPBOARD_SYNC_TAG)
                    .then(() => {
                        console.log('📋 Background sync scheduled');
                    })
                    .catch((error) => {
                        console.error('📋 Background sync registration failed:', error);
                    });
            }
            break;
            
        case 'CLIPBOARD_UPDATED':
            // Could trigger push notification to other devices
            console.log('📋 Clipboard updated in main app:', data?.preview);
            break;
            
        case 'ENABLE_NOTIFICATIONS':
            // Could subscribe to push notifications
            console.log('🔔 Notifications enabled');
            break;
    }
});

// Periodic Background Sync (if supported)
self.addEventListener('periodicsync', (event) => {
    console.log('⏰ Periodic background sync:', event.tag);
    
    if (event.tag === 'clipboard-check') {
        event.waitUntil(handlePeriodicClipboardCheck());
    }
});

async function handlePeriodicClipboardCheck() {
    console.log('⏰ Performing periodic clipboard check...');
    
    try {
        // This is limited by browser permissions and policies
        // Most browsers don't allow clipboard access from service workers
        // So we'll just notify the main app to check
        
        const clients = await self.clients.matchAll({
            includeUncontrolled: true,
            type: 'window'
        });
        
        clients.forEach(client => {
            client.postMessage({
                type: 'PERIODIC_CLIPBOARD_CHECK',
                timestamp: Date.now()
            });
        });
        
        console.log('⏰ Periodic check notification sent to clients');
    } catch (error) {
        console.error('⏰ Periodic clipboard check failed:', error);
    }
}

// Handle service worker updates
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Network status monitoring
let isOnline = true;

self.addEventListener('online', () => {
    console.log('🌐 Network online');
    isOnline = true;
    
    // Notify clients about network status change
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'NETWORK_STATUS',
                isOnline: true
            });
        });
    });
});

self.addEventListener('offline', () => {
    console.log('🌐 Network offline');
    isOnline = false;
    
    // Notify clients about network status change
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'NETWORK_STATUS',
                isOnline: false
            });
        });
    });
});

// Error handling
self.addEventListener('error', (event) => {
    console.error('❌ Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Service Worker unhandled rejection:', event.reason);
});

console.log('🚀 Enhanced Universal Clipboard Service Worker loaded');