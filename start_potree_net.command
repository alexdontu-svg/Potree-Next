#!/bin/zsh

set -e
cd "${0:A:h}"

if ! python3 -c 'import RangeHTTPServer' >/dev/null 2>&1; then
	python3 -m pip install --user rangehttpserver
fi

URL="http://127.0.0.1:8080/potree-net.html"
echo "Potree-Net: ${URL}"
(sleep 1 && open "${URL}") &
python3 -m RangeHTTPServer 8080 --bind 127.0.0.1
