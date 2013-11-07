PACKAGE_NAME = savelinkmenus-selected-links

all: xpi

xpi: buildscript/makexpi.sh
	cp buildscript/makexpi.sh ./
	./makexpi.sh -n $(PACKAGE_NAME) -o
	rm ./makexpi.sh

buildscript/makexpi.sh:
	git submodule update --init
