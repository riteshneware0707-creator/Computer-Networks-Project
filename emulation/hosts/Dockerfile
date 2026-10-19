FROM alpine:3.21

RUN apk add --no-cache iproute2 iputils iperf3

COPY host-init.sh /usr/local/bin/host-init
RUN chmod +x /usr/local/bin/host-init

ENTRYPOINT ["/usr/local/bin/host-init"]
