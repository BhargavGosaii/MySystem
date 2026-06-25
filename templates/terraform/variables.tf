variable "aws_region" {
  type        = string
  description = "AWS region to deploy resources"
  default     = "us-east-1"
}

variable "app_name" {
  type        = string
  description = "Application name (used for naming resources)"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "production"
}

variable "container_port" {
  type        = number
  description = "Port the application container listens on"
  default     = 3000
}

variable "container_cpu" {
  type        = number
  description = "CPU units for the ECS task (1024 = 1 vCPU)"
  default     = 256
}

variable "container_memory" {
  type        = number
  description = "Memory for the ECS task in MB"
  default     = 512
}

variable "enable_database" {
  type        = bool
  description = "Whether to provision an RDS PostgreSQL database"
  default     = true
}

variable "sentry_dsn" {
  type        = string
  description = "Sentry Data Source Name (DSN) for error tracking"
  default     = ""
}
