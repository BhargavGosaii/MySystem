resource "random_password" "db_password" {
  count   = var.enable_database ? 1 : 0
  length  = 16
  special = false
}

resource "aws_db_subnet_group" "main" {
  count      = var.enable_database ? 1 : 0
  name       = "${var.app_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.app_name}-db-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  count                  = var.enable_database ? 1 : 0
  identifier             = "${var.app_name}-db"
  allocated_storage      = 20
  max_allocated_storage  = 100
  engine                 = "postgres"
  engine_version         = "15"
  instance_class         = "db.t4g.micro" # cost-effective burstable Graviton instance
  db_name                = replace(var.app_name, "-", "_")
  username               = "mysystem_admin"
  password               = random_password.db_password[0].result
  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.db[0].id]
  skip_final_snapshot    = true
  publicly_accessible    = false

  tags = {
    Name = "${var.app_name}-db-postgres"
  }
}

# Save password in SSM Parameter Store so the developer can retrieve it if needed,
# and so ECS tasks can fetch it securely.
resource "aws_ssm_parameter" "db_url" {
  count       = var.enable_database ? 1 : 0
  name        = "/${var.app_name}/database_url"
  type        = "SecureString"
  description = "Database URL for the application"
  value       = "postgresql://${aws_db_instance.postgres[0].username}:${random_password.db_password[0].result}@${var.enable_rds_proxy ? aws_db_proxy.postgres[0].endpoint : aws_db_instance.postgres[0].endpoint}/${aws_db_instance.postgres[0].db_name}"
}
