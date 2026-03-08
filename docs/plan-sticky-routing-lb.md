# Plan: Sticky-Routing Load Balancer for Multi-Process Deployment

## Problem

The standalone server is single-process. Agent instances and their WebSocket
connections live in-memory on one Node.js process. To scale horizontally, we
need to route all requests for the same agent to the same process — both HTTP
and WebSocket upgrade requests.

## Constraints

- Agent IDs (UUIDs) are in the URL path: `/api/agent/:agentId/ws`
- WebSocket connections cannot migrate between processes
- Agent state is persisted to local filesystem (can be loaded on any node)
- Multiple clients can connect to the same agent simultaneously
- Agent creation happens on the node that receives the initial POST

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │         Nginx                │
                    │  consistent hash on agentId  │
   Clients ────────►  extract from URL path        │
                    │  proxy HTTP + WebSocket       │
                    └──────────┬──────────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
         ┌──────────┐   ┌──────────┐   ┌──────────┐
         │  Node A  │   │  Node B  │   │  Node C  │
         │  :3001   │   │  :3002   │   │  :3003   │
         │          │   │          │   │          │
         │ agents/  │   │ agents/  │   │ agents/  │
         │  ├ id1/  │   │  ├ id4/  │   │  ├ id7/  │
         │  └ id2/  │   │  └ id5/  │   │  └ id8/  │
         └────┬─────┘   └────┬─────┘   └────┬─────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                    ┌──────────────────┐
                    │  Shared Storage   │
                    │  (R2 / NFS / S3) │
                    │  durable backup  │
                    └──────────────────┘
```

---

## Component 1: Nginx Consistent Hash Router

Nginx extracts the agentId from the URL and uses consistent hashing to pick a
backend. This ensures the same agentId always routes to the same node (as long
as the node set is stable).

### Nginx Configuration

```nginx
# /etc/nginx/conf.d/vibesdk.conf

# Extract agentId from URL. Falls back to full URI for non-agent routes.
map $uri $agent_id {
    ~^/api/agent/(?<id>[0-9a-f-]+)  $id;
    default                          $uri;
}

# WebSocket upgrade detection
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream vibesdk_backends {
    # Consistent hashing on agentId ensures same agent → same backend
    hash $agent_id consistent;

    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3003 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name vibesdk.example.com;

    # Agent API routes — sticky by agentId
    location /api/agent/ {
        proxy_pass http://vibesdk_backends;
        proxy_http_version 1.1;

        # WebSocket upgrade passthrough
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long timeouts for WebSocket connections (24h)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Non-agent routes — round-robin is fine
    location / {
        proxy_pass http://vibesdk_backends;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Why Consistent Hashing

When a node is added or removed, only ~1/N of agents are remapped (where N is
the number of nodes). This minimizes disruption during scaling events.

| Operation          | Agents affected |
|--------------------|----------------|
| Add 1 node to 3   | ~25% remapped  |
| Remove 1 from 3   | ~33% remapped  |
| Node failure       | Same as remove — surviving nodes absorb |

---

## Component 2: Process Manager

Run multiple Node.js processes on each machine (or one per machine in a
cluster). Each process:

- Listens on a unique port (3001, 3002, 3003, ...)
- Has its own `AgentNamespace` in-memory map
- Writes agent state to a shared or per-node data directory
- Reports health via a `/health` endpoint

### Option A: PM2 (single machine)

```bash
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'vibesdk',
    script: 'server.ts',
    interpreter: 'bun',
    instances: 3,
    exec_mode: 'cluster',
    env: {
      PORT: 3001,  // PM2 auto-increments in cluster mode
      DATA_DIR: '/data/vibesdk',
    }
  }]
};
```

**Issue**: PM2 cluster mode assigns the same PORT to all instances and uses
the master process to distribute. This conflicts with our Nginx routing. Use
`fork` mode with explicit ports instead:

```javascript
module.exports = {
  apps: [
    { name: 'vibesdk-1', script: 'server.ts', env: { PORT: 3001, DATA_DIR: '/data/vibesdk' } },
    { name: 'vibesdk-2', script: 'server.ts', env: { PORT: 3002, DATA_DIR: '/data/vibesdk' } },
    { name: 'vibesdk-3', script: 'server.ts', env: { PORT: 3003, DATA_DIR: '/data/vibesdk' } },
  ]
};
```

### Option B: Docker Compose (multi-container)

```yaml
services:
  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on: [vibesdk-1, vibesdk-2, vibesdk-3]

  vibesdk-1:
    build: .
    environment:
      PORT: 3000
      DATA_DIR: /data
    volumes:
      - agent-data:/data

  vibesdk-2:
    build: .
    environment:
      PORT: 3000
      DATA_DIR: /data
    volumes:
      - agent-data:/data

  vibesdk-3:
    build: .
    environment:
      PORT: 3000
      DATA_DIR: /data
    volumes:
      - agent-data:/data

volumes:
  agent-data:
```

### Option C: Kubernetes (multi-node cluster)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vibesdk
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vibesdk
  template:
    metadata:
      labels:
        app: vibesdk
    spec:
      containers:
        - name: vibesdk
          image: vibesdk:latest
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
            - name: DATA_DIR
              value: /data
          volumeMounts:
            - name: agent-data
              mountPath: /data
      volumes:
        - name: agent-data
          persistentVolumeClaim:
            claimName: agent-data-pvc
---
# Use nginx-ingress with consistent hashing
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vibesdk
  annotations:
    nginx.ingress.kubernetes.io/upstream-hash-by: "$request_uri"
spec:
  rules:
    - host: vibesdk.example.com
      http:
        paths:
          - path: /api/agent
            pathType: Prefix
            backend:
              service:
                name: vibesdk
                port:
                  number: 3000
```

---

## Component 3: Shared State Directory

All processes must be able to read agent state files written by other processes.
This matters for failover: when a node goes down and consistent hashing
reassigns an agent to a different node, the new node must load the state.

### Options

| Approach | Latency | Durability | Complexity | Best For |
|----------|---------|------------|------------|----------|
| **Shared filesystem (NFS/EFS)** | Low | Medium | Low | Single-machine / small cluster |
| **Object storage (R2/S3)** | Medium | High | Medium | Multi-region / production |
| **SQLite on shared volume** | Low | Medium | Low | Replacing JSON state files |

### Recommended: Shared Volume + Async R2 Backup

For production multi-node:

1. **Local filesystem** for fast reads/writes (current implementation)
2. **Async background sync to R2** after each debounced state flush
3. On agent load, check local FS first, then R2 if missing

This requires adding an R2 sync step to `DebouncedFileWriter.flushAsync()`:

```typescript
async flushAsync(): Promise<void> {
    // ... existing local write ...
    if (this.r2Bucket) {
        await this.r2Bucket.put(this.stateKey, data);
    }
}
```

For single-machine multi-process: all processes share the same `DATA_DIR`, and
filesystem persistence already works. No R2 needed.

---

## Component 4: Health Checks and Graceful Drain

### Health Endpoint

Add to `server.ts`:

```typescript
app.get('/health', (c) => {
    const ns = c.env.CodeGenObject as AgentNamespace<SmartCodeGeneratorAgent>;
    return c.json({
        status: 'ok',
        agents: ns.size,
        uptime: process.uptime(),
    });
});
```

### Graceful Shutdown Sequence

When draining a node:

1. Stop accepting new agent creation (set a `draining` flag)
2. Send WebSocket close frame (code 1012 — Service Restart) to all connections
3. Flush all pending state to disk
4. Wait for WebSocket connections to close (timeout 30s)
5. Exit process — Nginx detects failure, rehashes agents to remaining nodes

Application code change needed:

```typescript
process.on('SIGTERM', () => {
    console.log('[Shutdown] Draining connections...');
    // Close all agent WebSockets with 1012
    for (const agent of allAgents()) {
        for (const ws of agent.getWebSockets()) {
            ws.close(1012, 'Service restarting');
        }
    }
    // Existing state flush hooks handle persistence
    setTimeout(() => process.exit(0), 30_000);
});
```

Clients should handle code 1012 by reconnecting after a short delay. The
frontend `use-chat.ts` hook needs:

```typescript
ws.onclose = (event) => {
    if (event.code === 1012) {
        // Server is restarting — reconnect after 2s
        setTimeout(() => reconnect(), 2000);
    }
};
```

---

## Component 5: Agent Migration on Node Failure

When Nginx consistent hashing reassigns an agent after a node failure:

1. New node receives request for agentId it doesn't have in memory
2. `AgentNamespace.getByName()` fires the factory, creating a new instance
3. `attachPersistence()` loads state from the shared filesystem
4. Agent resumes with full state (but no WebSocket connections)
5. Client reconnects WebSocket — agent lifecycle continues

**No code changes needed for basic failover** — the current `AgentNamespace`
lazy-creation + `attachPersistence()` already handles this, provided the state
files are accessible from the new node.

### Data Loss Window

State changes between the last debounced flush and the crash are lost. The
`DEBOUNCE_MS = 2000` means up to 2 seconds of state may be lost. For critical
state changes (like completed phases), consider immediate flush:

```typescript
// In agent code, after completing a critical operation:
this._persistence?.flushAsync();
```

---

## Implementation Phases

### Phase 1: Single-Machine Multi-Process (Immediate)

- Add `/health` endpoint to `server.ts`
- Configure `DATA_DIR` as shared directory
- Set up PM2 with 2-3 processes on different ports
- Add Nginx with consistent hash config
- Test: create agent on one process, reconnect WebSocket via another
- **Effort**: ~1 day

### Phase 2: Graceful Shutdown (Short-term)

- Add SIGTERM handler with WebSocket close code 1012
- Add client-side reconnect logic for code 1012
- Add `draining` flag to reject new agent creation during shutdown
- **Effort**: ~1 day

### Phase 3: Multi-Node with Shared Storage (Medium-term)

- Set up NFS/EFS shared volume or R2 async backup
- Add R2 sync to `DebouncedFileWriter`
- Test cross-node failover
- **Effort**: ~3 days

### Phase 4: Kubernetes Deployment (Long-term)

- Dockerize the application
- Write K8s manifests with nginx-ingress consistent hashing
- Set up PVC for shared state
- Add horizontal pod autoscaler
- **Effort**: ~1 week
