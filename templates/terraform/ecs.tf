# --- Amazon ECR (Container Registry) ---
resource "aws_ecr_repository" "app" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"
  force_destroy        = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- ECS Cluster ---
resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-cluster"
}

# --- CloudWatch Logs ---
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 7
}

# --- ECS Task Definition ---
resource "aws_ecs_task_definition" "app" {
  family                   = var.app_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = var.app_name
      # We use a placeholder image for the initial provision, so terraform succeeds.
      # The CI/CD pipeline will overwrite this image during actual deployment.
      image     = "${aws_ecr_repository.app.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = concat(
        [
          {
            name  = "PORT"
            value = tostring(var.container_port)
          },
          {
            name  = "NODE_ENV"
            value = var.environment
          }
        ],
        var.enable_redis ? [
          {
            name  = "REDIS_URL"
            value = "redis://${aws_elasticache_replication_group.redis[0].primary_endpoint_address}:6379"
          }
        ] : [],
        var.sentry_dsn != "" ? [
          {
            name  = "SENTRY_DSN"
            value = var.sentry_dsn
          }
        ] : []
      )
      # Securely load database URL parameter if database is enabled
      secrets = var.enable_database ? [
        {
          name      = "DATABASE_URL"
          valueFrom = aws_ssm_parameter.db_url[0].arn
        }
      ] : []
    }
  ])
}

# --- ECS Service ---
resource "aws_ecs_service" "main" {
  name            = var.app_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id # Required for pulling ECR images without NAT Gateway
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = var.app_name
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.http]
}
