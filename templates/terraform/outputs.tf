output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "URL of the ECR repository"
}

output "application_url" {
  value       = "http://${aws_lb.main.dns_name}"
  description = "Public URL of the Application Load Balancer"
}

output "database_endpoint" {
  value       = var.enable_database ? aws_db_instance.postgres[0].endpoint : "None"
  description = "RDS database endpoint"
}
