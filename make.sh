#!/bin/sh

appname=savelinkmenus-selected-links

cp buildscript/makexpi.sh ./
./makexpi.sh -n $appname -o
rm ./makexpi.sh

