-- AIShot Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User settings table (default capture settings and retention policy)
CREATE TABLE IF NOT EXISTS user_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    default_interval_minutes INT NOT NULL DEFAULT 1440,
    default_viewports JSON NOT NULL DEFAULT '[1920, 768, 375]',
    -- Retention policy settings (GFS-style backup rotation)
    retention_enabled BOOLEAN DEFAULT FALSE,
    max_screenshots_per_page INT NULL,           -- Hard limit per page (NULL = unlimited)
    keep_per_day INT DEFAULT 4,                  -- Keep 4 per day for first week
    keep_per_week INT DEFAULT 2,                 -- Keep 2 per week for first month
    keep_per_month INT DEFAULT 1,                -- Keep 1 per month for first year
    keep_per_year INT DEFAULT 1,                 -- Keep 1 per year for older
    max_age_days INT NULL,                       -- Delete after X days (NULL = unlimited)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    interval_minutes INT NULL,
    viewports JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    url VARCHAR(2048) NOT NULL,
    name VARCHAR(255) NOT NULL,
    interval_minutes INT NULL,
    viewports JSON NULL,
    last_screenshot_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    INDEX idx_site_id (site_id),
    INDEX idx_is_active (is_active),
    INDEX idx_last_screenshot (last_screenshot_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Screenshots table
CREATE TABLE IF NOT EXISTS screenshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    viewport VARCHAR(20) NOT NULL DEFAULT 'desktop',
    viewport_width INT NOT NULL DEFAULT 1920,
    file_path VARCHAR(512) NOT NULL,
    thumbnail_path VARCHAR(512),
    file_size INT,
    width INT,
    height INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    INDEX idx_page_id (page_id),
    INDEX idx_created_at (created_at),
    INDEX idx_viewport (viewport)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Instructions table (AI-generated page interaction scripts)
CREATE TABLE IF NOT EXISTS instructions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    script TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    execution_order INT DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMP NULL,
    last_success_at TIMESTAMP NULL,
    error_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    INDEX idx_page_id (page_id),
    INDEX idx_execution_order (execution_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
