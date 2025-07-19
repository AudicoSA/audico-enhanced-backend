#!/bin/bash

# Audico Enhanced Backend Setup Script
# This script helps you set up the enhanced multi-agent system

set -e  # Exit on any error

echo "🚀 Audico Enhanced Backend Setup"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if Node.js is installed
check_nodejs() {
    print_step "Checking Node.js installation..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 16+ and try again."
        exit 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

    if [ "$MAJOR_VERSION" -lt 16 ]; then
        print_error "Node.js version $NODE_VERSION is too old. Please install Node.js 16+ and try again."
        exit 1
    fi

    print_status "Node.js version $NODE_VERSION is compatible ✓"
}

# Check if npm is installed
check_npm() {
    print_step "Checking npm installation..."

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm and try again."
        exit 1
    fi

    NPM_VERSION=$(npm --version)
    print_status "npm version $NPM_VERSION is available ✓"
}

# Install dependencies
install_dependencies() {
    print_step "Installing dependencies..."

    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the project root directory."
        exit 1
    fi

    npm install
    print_status "Dependencies installed successfully ✓"
}

# Setup environment file
setup_environment() {
    print_step "Setting up environment configuration..."

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_status "Created .env file from template ✓"
            print_warning "Please edit .env file with your actual configuration values"
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_warning ".env file already exists, skipping creation"
    fi
}

# Create log directory
setup_logging() {
    print_step "Setting up logging directory..."

    if [ ! -d "logs" ]; then
        mkdir -p logs
        print_status "Created logs directory ✓"
    else
        print_status "Logs directory already exists ✓"
    fi
}

# Run database migrations
run_migrations() {
    print_step "Running database migrations..."

    if [ -f "migrations/run-migrations.js" ]; then
        npm run migrate
        print_status "Database migrations completed ✓"
    else
        print_warning "Migration script not found, skipping database setup"
    fi
}

# Test the setup
test_setup() {
    print_step "Testing setup..."

    # Test basic functionality
    if npm run test > /dev/null 2>&1; then
        print_status "Basic tests passed ✓"
    else
        print_warning "Some tests failed, but setup can continue"
    fi

    # Test health check
    if npm run health-check > /dev/null 2>&1; then
        print_status "Health check passed ✓"
    else
        print_warning "Health check failed, please verify configuration"
    fi
}

# Main setup function
main() {
    echo ""
    print_status "Starting Audico Enhanced Backend setup..."
    echo ""

    # Run setup steps
    check_nodejs
    check_npm
    install_dependencies
    setup_environment
    setup_logging
    run_migrations
    test_setup

    echo ""
    print_status "Setup completed successfully! 🎉"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your configuration"
    echo "2. Start the server with: npm start"
    echo "3. Test the API endpoints"
    echo ""
    echo "For help, see MIGRATION_GUIDE.md"
}

# Run main function
main "$@"
