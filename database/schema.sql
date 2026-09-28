CREATE TABLE records (
    heading VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    uid VARCHAR(50) NOT NULL,
    record_date DATE NOT NULL,
    record_time TIME NOT NULL,

    loc1 VARCHAR(255),
    loc2 VARCHAR(255),
    loc3 VARCHAR(255),
    loc4 VARCHAR(255),
    loc5 VARCHAR(255),
    loc6 VARCHAR(255),
    loc7 VARCHAR(255),
    loc8 VARCHAR(255),
    loc9 VARCHAR(255),
    loc10 VARCHAR(255),
    loc11 VARCHAR(255),
    loc12 VARCHAR(255),

    CONSTRAINT records_pkey
    PRIMARY KEY (heading, customer_name, uid)
);