-- Schema for the Scheduling Assistant.
-- All identifiers lowercase + snake_case (Linux MySQL is case-sensitive on table names).
-- InnoDB + utf8mb4 set explicitly. Invariants enforced by the schema, not the app.

CREATE TABLE IF NOT EXISTS managers (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS technicians (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  trade       VARCHAR(60)  NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference   VARCHAR(20)  NOT NULL UNIQUE,
  summary     VARCHAR(255) NOT NULL,
  status      ENUM('unscheduled', 'scheduled') NOT NULL DEFAULT 'unscheduled',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The conflict-prevention table.
-- uniq_tech_date_slot is the load-bearing constraint: two concurrent INSERTs
-- for the same (technician_id, scheduled_date, slot) will see one succeed and
-- the other fail with ER_DUP_ENTRY (errno 1062). The API maps that to 409.
-- uniq_quote ensures a quote can only be scheduled once.
CREATE TABLE IF NOT EXISTS jobs (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  technician_id   BIGINT UNSIGNED NOT NULL,
  quote_id        BIGINT UNSIGNED NOT NULL,
  manager_id      BIGINT UNSIGNED NOT NULL,
  scheduled_date  DATE NOT NULL,
  slot            ENUM('09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00') NOT NULL,
  status          ENUM('scheduled', 'completed') NOT NULL DEFAULT 'scheduled',
  assigned_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP NULL,

  CONSTRAINT fk_jobs_technician FOREIGN KEY (technician_id) REFERENCES technicians(id),
  CONSTRAINT fk_jobs_quote      FOREIGN KEY (quote_id)      REFERENCES quotes(id),
  CONSTRAINT fk_jobs_manager    FOREIGN KEY (manager_id)    REFERENCES managers(id),

  UNIQUE KEY uniq_tech_date_slot (technician_id, scheduled_date, slot),
  UNIQUE KEY uniq_quote (quote_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type            ENUM('job_assigned', 'job_completed') NOT NULL,
  recipient_type  ENUM('technician', 'manager') NOT NULL,
  recipient_id    BIGINT UNSIGNED NOT NULL,
  job_id          BIGINT UNSIGNED NOT NULL,
  message         VARCHAR(255) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         TIMESTAMP NULL,

  CONSTRAINT fk_notifications_job FOREIGN KEY (job_id) REFERENCES jobs(id),
  INDEX idx_recipient_unread (recipient_type, recipient_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
