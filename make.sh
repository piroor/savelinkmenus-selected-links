#!/bin/sh

appname=savelinkmenus-selected-links

cp makexpi/makexpi.sh ./
./makexpi.sh -n $appname -o
rm ./makexpi.sh

