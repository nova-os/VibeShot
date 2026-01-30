# VibeShot - Website Screenshot Monitor

A web application for automated website screenshot monitoring. Track visual changes on your websites with periodic full-page screenshots.

## Features

- **Multi-user authentication** - Secure JWT-based login system
- **Site management** - Organize monitored pages by domain/site
- **Configurable intervals** - Set custom capture intervals per page
- **Multi-viewport screenshots** - Captures mobile, tablet, and desktop views
- **Full-page screenshots** - Captures entire page using Puppeteer
- **Thumbnail generation** - Quick preview thumbnails for the gallery
- **Screenshot timeline** - Browse historical screenshots with viewer
- **Viewport filtering** - Filter screenshots by device type
- **Background worker** - Independent screenshot capture process
- **Browser pool** - 4 parallel Puppeteer instances for efficiency

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  MariaDB    │  │  API Server │  │  Screenshot Worker  │ │
│  │  Database   │  │  (Express)  │  │   (Puppeteer x4)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                │                    │             │
│         └────────────────┼────────────────────┘             │
│                          │                                  │
│                   Screenshots Volume                        │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd vibeshot
   ```

2. Create environment file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and set secure values:
   ```env
   MARIADB_ROOT_PASSWORD=your-secure-root-password
   MARIADB_DATABASE=vibeshot
   MARIADB_USER=vibeshot
   MARIADB_PASSWORD=your-secure-password
   JWT_SECRET=your-super-secret-jwt-key-change-this
   ```

4. Start the application:
   ```bash
   ./scripts/start.sh
   ```

5. (Optional) Seed with test data:
   ```bash
   ./scripts/seed.sh
   ```

6. Open http://localhost:3000 in your browser

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/start.sh` | Start all services |
| `./scripts/stop.sh` | Stop all services |
| `./scripts/logs.sh [service]` | View logs (api, worker, mysql) |
| `./scripts/reset.sh` | Reset all data (database + screenshots) |
| `./scripts/reset.sh --seed` | Reset and seed with test data |
| `./scripts/seed.sh` | Seed database with test data |
| `./scripts/install.sh` | Reinstall dependencies |

### Test Account (after seeding)

- **Email:** test@example.com
- **Password:** password123

The seed script creates a test site (heise.de) with two pages for testing.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MARIADB_ROOT_PASSWORD` | MariaDB root password | - |
| `MARIADB_DATABASE` | Database name | vibeshot |
| `MARIADB_USER` | Database user | vibeshot |
| `MARIADB_PASSWORD` | Database password | - |
| `JWT_SECRET` | Secret for JWT tokens | - |
| `BROWSER_POOL_SIZE` | Number of parallel browsers | 4 |

### Screenshot Intervals

When adding a page, you can configure the capture interval in minutes:
- Minimum: 5 minutes
- Default: 360 minutes (6 hours)
- Recommended: 60-1440 minutes (1-24 hours)

## Usage

1. **Register/Login** - Create an account or sign in
2. **Add a Site** - Click "Add Site" and enter the domain name
3. **Add Pages** - Navigate to the site and add pages to monitor
4. **Configure Intervals** - Set how often to capture each page
5. **View Screenshots** - Browse the screenshot timeline for each page
6. **Trigger Capture** - Use "Capture Now" for immediate screenshots

## Development

### Local Development (without Docker)

1. Install dependencies:
   ```bash
   cd api && npm install
   cd ../worker && npm install
   ```

2. Start MariaDB locally or via Docker:
   ```bash
   docker run -d --name vibeshot-mariadb \
     -e MARIADB_ROOT_PASSWORD=root \
     -e MARIADB_DATABASE=vibeshot \
     -e MARIADB_USER=vibeshot \
     -e MARIADB_PASSWORD=password \
     -p 3306:3306 \
     mariadb:12.1.2
   ```

3. Initialize database:
   ```bash
   mysql -u vibeshot -p vibeshot < mysql/init.sql
   ```

4. Start the API server:
   ```bash
   cd api
   npm run dev
   ```

5. Start the worker (in another terminal):
   ```bash
   cd worker
   npm run dev
   ```

### Project Structure

```
vibeshot/
├── docker-compose.yml      # Docker orchestration
├── api/                    # Express.js API server
│   ├── src/
│   │   ├── index.js        # Server entry point
│   │   ├── config/         # Database configuration
│   │   ├── middleware/     # Auth middleware
│   │   └── routes/         # API routes
│   └── public/             # Frontend static files
├── worker/                 # Background screenshot worker
│   └── src/
│       ├── index.js        # Worker entry point
│       ├── scheduler.js    # Job scheduling
│       ├── browser-pool.js # Puppeteer pool management
│       └── screenshot.js   # Screenshot capture logic
└── mysql/
    └── init.sql            # Database schema
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Sites
- `GET /api/sites` - List all sites
- `POST /api/sites` - Create site
- `GET /api/sites/:id` - Get site
- `PUT /api/sites/:id` - Update site
- `DELETE /api/sites/:id` - Delete site

### Pages
- `GET /api/sites/:id/pages` - List pages for site
- `POST /api/sites/:id/pages` - Add page to site
- `GET /api/pages/:id` - Get page
- `PUT /api/pages/:id` - Update page
- `DELETE /api/pages/:id` - Delete page
- `POST /api/pages/:id/capture` - Trigger capture

### Screenshots
- `GET /api/pages/:id/screenshots` - List screenshots
- `GET /api/screenshots/:id` - Get metadata
- `GET /api/screenshots/:id/image` - Get image file
- `GET /api/screenshots/:id/thumbnail` - Get thumbnail
- `DELETE /api/screenshots/:id` - Delete screenshot

## Troubleshooting

### Worker not capturing screenshots
- Check worker logs: `docker-compose logs worker`
- Ensure the page URL is accessible
- Verify the page is set to "active"

### Database connection errors
- Wait for MariaDB to fully initialize (may take 30-60 seconds)
- Check MariaDB logs: `docker-compose logs mysql`

### Out of disk space
- Screenshots are stored in a Docker volume
- Clean old screenshots through the UI or directly in the database

## License

MIT
