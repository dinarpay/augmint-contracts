echo "launching ganache-cli (aka testrpc) with deterministic addresses" $(yarn bin)
yarn ganache-cli \
--gasLimit 0x47D5DE \
--gasPrice 1000000000 \
--network-id 999 \
-m "hello build tongue rack parade express shine salute glare rate spice stock"
