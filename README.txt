SOHAIL'S COLLECTION - STORE + ADMIN PANEL (v2)

WHAT'S NEW IN THIS VERSION
- The admin can now do EVERYTHING from the browser. Nobody needs to touch the project folder anymore.
    * Upload product photos directly (phone camera or gallery works) with a live preview
    * Photos tab: library of all uploaded photos, upload many at once, delete unused ones,
      and change the big photo on the home page
    * Products: add / edit / delete, price, stock, badge, hide or show
    * Categories tab: add, rename, delete (the store menu updates by itself)
    * Orders: status, delete finished orders, new-order alerts
    * Backup button: downloads all your data as one file
- Docker support, ready to deploy.
- Security: only needed files are public, uploads are checked (real JPG/PNG/WEBP/GIF only, max 5 MB),
  and the server will not start in production with the default password.

ADMIN PANEL:  /admin.html   (log in with ADMIN_PASSWORD)

----------------------------------------------------------------------
OPTION 1: RUN WITH DOCKER (recommended)
----------------------------------------------------------------------
1. Install Docker Desktop (or Docker Engine + Compose plugin).
2. Copy .env.example to .env and set ADMIN_PASSWORD to a long strong password.
3. In this folder run:
       docker compose up -d --build
4. Open http://localhost:3000        (store)
        http://localhost:3000/admin.html   (admin)

Useful commands:
   docker compose logs -f           see the log
   docker compose down              stop (your data is kept)
   docker compose up -d --build     update after changing code

All data (products, orders, categories, uploaded photos) is stored in the Docker volume "store-data"
(mounted at /data inside the container). It survives restarts and rebuilds.
Do NOT run "docker compose down -v" - the -v deletes the volume and all your data.

Plain docker, without compose:
   docker build -t sohails-collection .
   docker run -d -p 3000:3000 -e ADMIN_PASSWORD=your-password -v store-data:/data --restart unless-stopped sohails-collection

----------------------------------------------------------------------
OPTION 2: RUN WITHOUT DOCKER (Node.js 18+, no npm install needed)
----------------------------------------------------------------------
Windows:  edit the password in start.bat, then double-click it.
Mac/Linux:  ADMIN_PASSWORD="your-password" node server.js
Data is saved in the "data" folder (including data/uploads for photos).

----------------------------------------------------------------------
PUTTING IT ONLINE
----------------------------------------------------------------------
You need a host that keeps files between restarts (a persistent disk / volume), plus HTTPS.
- VPS (DigitalOcean, Hetzner, etc.): install Docker, upload this folder, follow Option 1, then put
  Caddy or Nginx in front for HTTPS and set TRUST_PROXY=1 in .env. Simple Caddy setup:
      yourdomain.com {
          reverse_proxy localhost:3000
      }
- Render.com: push this folder to GitHub, then New > Blueprint (it reads render.yaml). A paid plan is
  needed for the disk. Set ADMIN_PASSWORD when asked.
- Railway / Fly.io: deploy the Dockerfile and attach a volume mounted at /data.
Free plans without a persistent volume WILL erase orders and uploaded photos on restart.

Environment variables:
   ADMIN_PASSWORD   required in production
   PORT             default 3000
   DATA_DIR         default ./data  (Docker image uses /data)
   TRUST_PROXY      set 1 when behind a proxy that sets X-Forwarded-For
   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   optional phone alert for new orders

----------------------------------------------------------------------
NEW ORDER ALERTS
----------------------------------------------------------------------
Keep the admin page open: it checks every 8 seconds and gives a beep, banner and a count on the Orders
button. Click once on the page after opening it so the browser allows sound.
Phone alerts with Telegram (free): create a bot with @BotFather, send it a message, open
https://api.telegram.org/botYOUR_TOKEN/getUpdates to find your chat id, then put both values in .env.
The alert includes the customer's name, phone and address, so use your own private chat only.

----------------------------------------------------------------------
GOOD TO KNOW
----------------------------------------------------------------------
- Backups: use the Backup button now and then. It saves products, orders and categories as JSON.
  Photos live in the data volume (uploads folder); back up the volume too, e.g.
      docker run --rm -v store-data:/data -v "$PWD":/b alpine tar czf /b/store-backup.tgz -C /data .
- Deleting a product or changing its photo also deletes the old uploaded file if nothing else uses it.
- A category cannot be deleted while products use it. Orders can be deleted only when Cancelled/Delivered.
- Admin login is limited to 5 wrong tries per 10 minutes. Logins last 8 hours.
- No online payment: Cash on Delivery works; Bank Transfer / Online Payment orders are only recorded and
  you must confirm payment with the customer yourself.
- Data is stored in simple JSON files, fine for a small shop. For very many orders, move to a database.
- The 10 starter products use the drawn pictures in images/. Replace them from the admin panel anytime.
