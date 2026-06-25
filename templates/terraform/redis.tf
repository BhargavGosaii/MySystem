# Amazon ElastiCache Redis Cluster
# Provides high-performance sub-millisecond caching and session/queue management.

variable "enable_redis" {
  type        = bool
  description = "Whether to provision an ElastiCache Redis cluster"
  default     = false
}

# Redis Security Group
resource "aws_security_group" "redis" {
  count       = var.enable_redis ? 1 : 0
  name        = "${var.app_name}-redis-sg"
  description = "Access to Redis from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Allow Redis access from ECS tasks"
    from_port       = 6379
    to_port         = 6379
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
    Name = "${var.app_name}-redis-sg"
  }
}

# Redis Subnet Group (places Redis in private subnets)
resource "aws_elasticache_subnet_group" "redis" {
  count      = var.enable_redis ? 1 : 0
  name       = "${var.app_name}-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id
}

# Redis Replication Group (Cluster)
resource "aws_elasticache_replication_group" "redis" {
  count                       = var.enable_redis ? 1 : 0
  replication_group_id        = "${var.app_name}-redis"
  description                 = "Redis cluster for ${var.app_name}"
  node_type                   = "cache.t4g.micro" # cost-effective Graviton node
  num_cache_clusters          = 1
  parameter_group_name        = "default.redis7"
  port                        = 6379
  subnet_group_name           = aws_elasticache_subnet_group.redis[0].name
  security_group_ids          = [aws_security_group.redis[0].id]
  automatic_failover_enabled  = false # Disable for single node to save cost

  tags = {
    Name = "${var.app_name}-redis"
  }
}

# Save Redis URL in SSM Parameter Store
resource "aws_ssm_parameter" "redis_url" {
  count       = var.enable_redis ? 1 : 0
  name        = "/${var.app_name}/redis_url"
  type        = "SecureString"
  description = "Redis URL for the application"
  value       = "redis://${aws_elasticache_replication_group.redis[0].primary_endpoint_address}:6379"
}
