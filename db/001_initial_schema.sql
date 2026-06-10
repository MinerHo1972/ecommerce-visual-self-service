-- See project document: /技术文档/电商视觉自助台_RDS_Migration草案_v0.1.sql
-- This local copy is kept with the application source for development.

CREATE TABLE IF NOT EXISTS prompt_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  scene VARCHAR(64) NOT NULL,
  platform VARCHAR(64),
  prompt_skeleton TEXT NOT NULL,
  variables_json JSON NOT NULL,
  negative_prompt TEXT,
  recommend_params_json JSON,
  ref_image_hint VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prompt_scene (scene),
  INDEX idx_prompt_platform (platform),
  INDEX idx_prompt_status (status)
);

CREATE TABLE IF NOT EXISTS layer_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  canvas_width INT NOT NULL,
  canvas_height INT NOT NULL,
  template_json JSON NOT NULL,
  focus_area_json JSON,
  export_sizes_json JSON,
  cover_oss_key VARCHAR(512),
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_layer_category (category),
  INDEX idx_layer_status (status)
);
