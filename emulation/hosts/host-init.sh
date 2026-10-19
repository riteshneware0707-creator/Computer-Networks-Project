#!/bin/sh
set -eu

attempt=0
until ip link show eth1 >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Containerlab did not attach eth1" >&2
    exit 1
  fi
  sleep 1
done

ip link set lo up
ip link set eth1 up
ip address replace "$HOST_IP" dev eth1
ip route replace default via "$DEFAULT_GATEWAY"

if [ "${START_IPERF_SERVER:-false}" = "true" ]; then
  iperf3 -s -D
fi

exec sleep infinity
