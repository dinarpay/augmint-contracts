echo "launching ganache-cli (aka testrpc) with deterministic addresses" $(npm bin)
$(npm bin)/ganache-cli \
--gasLimit 0x47D5DE \
--gasPrice 1000000000 \ # 1 GWEI
--network-id 999 \
-m "hello build tongue rack parade express shine salute glare rate spice stock"
