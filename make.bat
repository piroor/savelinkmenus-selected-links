setlocal
set appname=savelinkmenus-selected-links

copy buildscript\makexpi.sh .\
bash makexpi.sh -n %appname% -o
del makexpi.sh
endlocal
