# Party Navigator Relay

Tiny dependency-free Node.js relay. It does not connect to Minecraft servers and does not need a Minecraft mod installed on the game server.

## Run

Requires Node.js 18+.

```bash
node server.js
```

Environment variables:
- `PORT` (default `8787`)
- `HOST` (default `0.0.0.0`)

For two PCs on a LAN, allow TCP port 8787 through the Windows firewall on the relay PC and set both clients' `party-navigator-relay.txt` to `http://RELAY_PC_LAN_IP:8787`.

Put the relay behind HTTPS when exposed to the internet. For a private LAN/VPS, restrict the firewall to the users who need it.

The relay keeps only in-memory party/session state; restarting it clears parties and pending invites.
