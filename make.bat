setlocal
set appname=savelinkmenus-selected-links

copy makexpi\makexpi.sh .\
bash makexpi.sh -n %appname% -o
del makexpi.sh
endlocal
