# Pull the latest image from Docker Hub
docker pull jeevanjames2000/gsecurity:latest

# Stop and remove the existing container (if it exists)
docker stop gsecurity 2> $null
docker rm gsecurity 2> $null

# Run the updated container on port 7000
docker run -d -p 9000:9000 --name gsecurity jeevanjames2000/gsecurity:latest

Write-Host "Container updated and running on port 9000."