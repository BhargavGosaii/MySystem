# Amazon ECR (Container Registry) for EC2 deployments
resource "aws_ecr_repository" "app" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"
  force_destroy        = true

  image_scanning_configuration {
    scan_on_push = true
  }
}
