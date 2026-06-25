output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "URL of the ECR repository"
}

output "instance_public_ip" {
  value       = aws_eip.app.public_ip
  description = "Permanent public Elastic IP of the EC2 instance"
}

output "instance_id" {
  value       = aws_instance.app.id
  description = "The ID of the EC2 instance (used for SSM deploys)"
}

output "application_url" {
  value       = "http://${aws_eip.app.public_ip}"
  description = "The web address of your application"
}
