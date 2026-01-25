-- VibeShot Database Schema

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
    default_viewports JSON DEFAULT (JSON_ARRAY(1920, 768, 375)),
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
-- script_type: 'eval' (default) for page.evaluate() scripts, 'actions' for Puppeteer action DSL
CREATE TABLE IF NOT EXISTS instructions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    script TEXT,
    script_type ENUM('eval', 'actions') DEFAULT 'eval',
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

-- Capture jobs table (tracks screenshot capture progress for UI feedback)
CREATE TABLE IF NOT EXISTS capture_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    status ENUM('pending', 'capturing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    current_viewport VARCHAR(20) NULL,
    viewports_completed INT NOT NULL DEFAULT 0,
    viewports_total INT NOT NULL DEFAULT 0,
    error_message TEXT NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    INDEX idx_page_status (page_id, status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Screenshot errors table (JS console errors and network failures captured during screenshot)
CREATE TABLE IF NOT EXISTS screenshot_errors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    screenshot_id INT NOT NULL,
    error_type ENUM('js', 'network') NOT NULL,
    message TEXT NOT NULL,
    -- JS error specific fields
    source VARCHAR(2048) NULL,
    line_number INT NULL,
    column_number INT NULL,
    stack TEXT NULL,
    -- Network error specific fields
    request_url VARCHAR(2048) NULL,
    request_method VARCHAR(10) NULL,
    status_code INT NULL,
    resource_type VARCHAR(50) NULL,
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE CASCADE,
    INDEX idx_screenshot_id (screenshot_id),
    INDEX idx_error_type (error_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tests table (AI-generated page test scripts with assertions)
-- script_type: 'eval' (default) for page.evaluate() scripts, 'actions' for Puppeteer action DSL
CREATE TABLE IF NOT EXISTS tests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    script TEXT,
    script_type ENUM('eval', 'actions') DEFAULT 'eval',
    is_active BOOLEAN DEFAULT TRUE,
    execution_order INT DEFAULT 0,
    viewports JSON DEFAULT NULL,  -- NULL = all viewports, or array like ["desktop", "mobile"]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    INDEX idx_page_id (page_id),
    INDEX idx_execution_order (execution_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Test results table (records test execution per screenshot)
CREATE TABLE IF NOT EXISTS test_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_id INT NOT NULL,
    screenshot_id INT NOT NULL,
    passed BOOLEAN NOT NULL,
    message TEXT,
    execution_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE CASCADE,
    INDEX idx_test_id (test_id),
    INDEX idx_screenshot_id (screenshot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI generation sessions (tracks instruction/test script generation)
CREATE TABLE IF NOT EXISTS ai_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('instruction', 'test') NOT NULL,
    target_id INT NOT NULL,  -- instruction_id or test_id
    status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_target (type, target_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI interaction messages (tool calls, responses, etc.)
CREATE TABLE IF NOT EXISTS ai_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    role ENUM('system', 'user', 'assistant', 'tool_call', 'tool_result') NOT NULL,
    content TEXT NOT NULL,
    tool_name VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE,
    INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
