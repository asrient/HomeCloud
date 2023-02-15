import { add } from "@pine/lib/utils";
import { subtractRelay } from "@pine/node-shim/index";
import { getInfo } from "./info";
import { readFile } from "node:fs/promises";
import path from "node:path";

console.log("Hi from node!");

console.log("Add from lib:", add(1, 2));

console.log("Subtract from node-shim:", subtractRelay(1, 2));

console.log("Product Info:", getInfo());

readFile(path.join(__dirname, '../assets/read.txt'), "utf8").then((data) => {
    console.log("Read file:", data);
    }).catch((err) => {
    console.error(err);
});
