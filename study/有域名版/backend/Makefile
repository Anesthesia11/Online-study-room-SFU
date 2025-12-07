.PHONY: help install install-dev test lint format type-check clean run

help:
	@echo "Available commands:"
	@echo "  make install      - Install production dependencies"
	@echo "  make install-dev  - Install development dependencies"
	@echo "  make test         - Run tests with coverage"
	@echo "  make lint         - Run linters (ruff)"
	@echo "  make format       - Format code with black"
	@echo "  make type-check   - Run type checking with mypy"
	@echo "  make clean        - Remove generated files"
	@echo "  make run          - Run the development server"

install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements.txt -r requirements-dev.txt

test:
	pytest

lint:
	ruff check .

format:
	black .
	ruff check --fix .

type-check:
	mypy .

clean:
	rm -rf .pytest_cache
	rm -rf .coverage
	rm -rf htmlcov
	rm -rf .mypy_cache
	rm -rf .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

run:
	python app.py
