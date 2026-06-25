# AWS RDS Proxy (Managed PgBouncer Connection Pooler)
# Pools database connections to allow the application to scale to thousands of concurrent users
# without exhausting database connection limits or memory.

variable "enable_rds_proxy" {
  type        = bool
  description = "Whether to provision an RDS Proxy connection pooler"
  default     = false
}

# 1. AWS Secrets Manager Secret to store RDS credentials (required for RDS Proxy)
resource "aws_secretsmanager_secret" "db_credentials" {
  count                   = var.enable_database && var.enable_rds_proxy ? 1 : 0
  name                    = "${var.app_name}-db-credentials"
  recovery_window_in_days = 0 # force deletion on destroy for clean cleanup
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  count     = var.enable_database && var.enable_rds_proxy ? 1 : 0
  secret_id = aws_secretsmanager_secret.db_credentials[0].id
  secret_string = jsonencode({
    username             = aws_db_instance.postgres[0].username
    password             = random_password.db_password[0].result
    engine               = "postgres"
    host                 = aws_db_instance.postgres[0].address
    port                 = 5432
    dbInstanceIdentifier = aws_db_instance.postgres[0].identifier
  })
}

# 2. IAM Role for RDS Proxy to access Secrets Manager
resource "aws_iam_role" "rds_proxy" {
  count = var.enable_database && var.enable_rds_proxy ? 1 : 0
  name  = "${var.app_name}-rds-proxy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "rds_proxy" {
  count       = var.enable_database && var.enable_rds_proxy ? 1 : 0
  name        = "${var.app_name}-rds-proxy-policy"
  description = "Allows RDS Proxy to read secrets from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Effect   = "Allow"
        Resource = [aws_secretsmanager_secret.db_credentials[0].arn]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_proxy" {
  count      = var.enable_database && var.enable_rds_proxy ? 1 : 0
  role       = aws_iam_role.rds_proxy[0].name
  policy_arn = aws_iam_policy.rds_proxy[0].arn
}

# 3. RDS Proxy Security Group
resource "aws_security_group" "rds_proxy" {
  count       = var.enable_database && var.enable_rds_proxy ? 1 : 0
  name        = "${var.app_name}-rds-proxy-sg"
  description = "Security Group for RDS Proxy"
  vpc_id      = aws_vpc.main.id

  # Allow ECS tasks to connect to the RDS Proxy
  ingress {
    description     = "Allow DB traffic from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-rds-proxy-sg"
  }
}

# Allow RDS database to accept connections from the RDS Proxy
resource "aws_security_group_rule" "db_allow_rds_proxy" {
  count                    = var.enable_database && var.enable_rds_proxy ? 1 : 0
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db[0].id
  source_security_group_id = aws_security_group.rds_proxy[0].id
  description              = "Allow traffic from RDS Proxy"
}

# 4. RDS Proxy
resource "aws_db_proxy" "postgres" {
  count                  = var.enable_database && var.enable_rds_proxy ? 1 : 0
  name                   = "${var.app_name}-db-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy[0].arn
  vpc_security_group_ids = [aws_security_group.rds_proxy[0].id]
  vpc_subnet_ids         = aws_subnet.private[*].id

  auth {
    auth_scheme = "SECRETS"
    description = "Database authentication via Secrets Manager"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_credentials[0].arn
  }

  tags = {
    Name = "${var.app_name}-db-proxy"
  }
}

# 5. Connect RDS Proxy to the database instance
resource "aws_db_proxy_default_target_group" "postgres" {
  count         = var.enable_database && var.enable_rds_proxy ? 1 : 0
  db_proxy_name = aws_db_proxy.postgres[0].name

  connection_pool_config {
    max_connections_percent      = 100
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

resource "aws_db_proxy_target" "postgres" {
  count                 = var.enable_database && var.enable_rds_proxy ? 1 : 0
  db_proxy_name         = aws_db_proxy.postgres[0].name
  target_group_name     = aws_db_proxy_default_target_group.postgres[0].name
  db_instance_identifier = aws_db_instance.postgres[0].id
}
