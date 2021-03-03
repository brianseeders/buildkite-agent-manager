.DEFAULT_GOAL := build
APP := elastic-buildkite-manager

TAG=$(shell git log --pretty=format:%aI -1 | sed -e 's/[^0-9]*//g;s/.\{4\}$$//' )-$(shell git log --pretty=format:%h -1)

IMAGE=docker.elastic.co/infra/$(APP)
TAGGED_IMAGE=$(IMAGE):$(TAG)
LATEST_IMAGE=$(IMAGE):latest

.PHONY: build-project
build-project:
	npm run build

.PHONY: docker-build
docker-build:
	docker build -t $(APP) .

.PHONY: docker-push
docker-push: docker-build
	docker tag $(APP) $(TAGGED_IMAGE)
	docker push $(TAGGED_IMAGE)
	docker tag $(APP) $(LATEST_IMAGE)
	docker push $(LATEST_IMAGE)

.PHONY: debug
debug:
	@echo APP=$(APP)
	@echo TAG=$(TAG)
	@echo IMAGE=$(IMAGE)
	@echo TAGGED_IMAGE=$(TAGGED_IMAGE)
	@echo LATEST_IMAGE=$(LATEST_IMAGE)
