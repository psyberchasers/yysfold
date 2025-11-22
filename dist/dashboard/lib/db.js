"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_path_1 = __importDefault(require("node:path"));
let db = null;
function getDatabase() {
    if (db)
        return db;
    const dataDir = process.env.DATA_DIR ?? node_path_1.default.resolve('..', 'artifacts');
    const dbPath = node_path_1.default.join(dataDir, 'index.db');
    db = new better_sqlite3_1.default(dbPath, { readonly: true, fileMustExist: true });
    return db;
}
