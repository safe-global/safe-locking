default: help

CONTRACTS_DIR = ../contracts
MUNGED_DIR    = munged

help:
	@echo "usage:"
	@echo "  make clean:  remove all generated files (those ignored by git)"
	@echo "  make munged: create $(MUNGED_DIR) directory"

munged:  $(wildcard $(CONTRACTS_DIR)/*.sol)
	rm -rf $@
	cp -r $(CONTRACTS_DIR) $@

clean:
	git clean -fdX
