import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
    WorkflowConfig,
    WorkflowCreateRequest,
    WorkflowExecution,
    WorkflowExecutionResult,
    WorkflowInputField,
    WorkflowInputs,
    WorkflowTrigger,
    WorkflowTriggerCreateRequest,
    WorkflowTriggerUpdatePayload,
    WorkflowUpdatePayload,
    WorkflowColor,
    ListWorkflowsParams,
    ListWorkflowExecutionsParams,
    ListTriggersParams,
} from 'shared/types.js';

// Promise wrappers for sqlite3
class WorkflowDB {
    private db!: sqlite3.Database;

    open(dbPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const dir = path.dirname(dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.db = new sqlite3.Database(dbPath, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row as T | undefined);
            });
        });
    }

    all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows as T[]);
            });
        });
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async initTables(): Promise<void> {
        await this.run(`
            CREATE TABLE IF NOT EXISTS workflow_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                author TEXT NOT NULL DEFAULT '',
                version TEXT NOT NULL DEFAULT '1.0.0',
                is_enabled INTEGER NOT NULL DEFAULT 1,
                color TEXT,
                input_fields TEXT NOT NULL DEFAULT '[]',
                max_exec_time_secs INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS triggers (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS workflow_trigger_map (
                workflow_id TEXT NOT NULL,
                trigger_id TEXT NOT NULL,
                PRIMARY KEY (workflow_id, trigger_id)
            )
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS workflow_executions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT,
                script TEXT,
                trigger_id TEXT,
                inputs_json TEXT,
                result_json TEXT,
                started_at TEXT NOT NULL,
                ended_at TEXT
            )
        `);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON workflow_executions(workflow_id)`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_executions_started_at ON workflow_executions(started_at)`);
    }
}

type ConfigRow = {
    id: string;
    name: string;
    description: string | null;
    author: string;
    version: string;
    is_enabled: number;
    color: string | null;
    input_fields: string;
    max_exec_time_secs: number | null;
    created_at: string;
    updated_at: string;
};

type TriggerRow = {
    id: string;
    type: string;
    data: string;
    created_at: string;
};

type ExecutionRow = {
    id: string;
    workflow_id: string | null;
    script: string | null;
    trigger_id: string | null;
    inputs_json: string | null;
    result_json: string | null;
    started_at: string;
    ended_at: string | null;
};

function rowToWorkflowConfig(row: ConfigRow): WorkflowConfig {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        author: row.author,
        version: row.version,
        isEnabled: row.is_enabled === 1,
        color: (row.color as WorkflowColor) ?? undefined,
        inputFields: JSON.parse(row.input_fields) as WorkflowInputField[],
        maxExecTimeSecs: row.max_exec_time_secs ?? undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}

function rowToTrigger(row: TriggerRow): WorkflowTrigger {
    return {
        id: row.id,
        type: row.type as WorkflowTrigger['type'],
        data: row.data,
        createdAt: new Date(row.created_at),
    };
}

function rowToWorkflowExecution(row: ExecutionRow): WorkflowExecution {
    return {
        id: row.id,
        workflowId: row.workflow_id,
        script: row.script ?? undefined,
        triggerId: row.trigger_id ?? undefined,
        inputs: row.inputs_json ? JSON.parse(row.inputs_json) as WorkflowInputs : undefined,
        result: row.result_json ? JSON.parse(row.result_json) as WorkflowExecutionResult : undefined,
        startedAt: new Date(row.started_at),
        endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
    };
}

export class WorkflowRepository {
    private db = new WorkflowDB();
    private workflowsDir: string;

    constructor(workflowsDir: string) {
        this.workflowsDir = workflowsDir;
    }

    async open(): Promise<void> {
        const dbPath = path.join(this.workflowsDir, 'workflows.db');
        await this.db.open(dbPath);
        await this.db.initTables();
    }

    async close(): Promise<void> {
        await this.db.close();
    }

    // --- Workflow Configs ---

    async getWorkflow(id: string): Promise<WorkflowConfig> {
        const row = await this.db.get<ConfigRow>(
            'SELECT * FROM workflow_configs WHERE id = ?', [id]
        );
        if (!row) throw new Error(`Workflow not found: ${id}`);
        return rowToWorkflowConfig(row);
    }

    async listWorkflows(params?: ListWorkflowsParams): Promise<WorkflowConfig[]> {
        let sql = 'SELECT * FROM workflow_configs';
        const sqlParams: any[] = [];
        const conditions: string[] = [];

        if (params?.isEnabled !== undefined) {
            conditions.push('is_enabled = ?');
            sqlParams.push(params.isEnabled ? 1 : 0);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        const sortCol = ({ name: 'name', createdAt: 'created_at', updatedAt: 'updated_at' } as const)[params?.sortBy ?? 'createdAt'] ?? 'created_at';
        const sortDir = params?.sortDirection === 'asc' ? 'ASC' : 'DESC';
        sql += ` ORDER BY ${sortCol} ${sortDir}`;

        const rows = await this.db.all<ConfigRow>(sql, sqlParams);
        return rows.map(rowToWorkflowConfig);
    }

    async createWorkflow(data: WorkflowCreateRequest): Promise<WorkflowConfig> {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await this.db.run(
            `INSERT INTO workflow_configs (id, name, description, author, version, is_enabled, input_fields, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.name, data.description ?? null, modules.config.DEVICE_NAME, '1.0.0', 1,
                '[]', now, now]
        );

        return this.getWorkflow(id);
    }

    async updateWorkflow(data: WorkflowUpdatePayload): Promise<WorkflowConfig> {
        const existing = await this.getWorkflow(data.id);
        const now = new Date().toISOString();

        const fields: string[] = ['updated_at = ?'];
        const params: any[] = [now];

        if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
        if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
        if (data.isEnabled !== undefined) { fields.push('is_enabled = ?'); params.push(data.isEnabled ? 1 : 0); }
        if (data.color !== undefined) { fields.push('color = ?'); params.push(data.color); }
        if (data.inputFields !== undefined) { fields.push('input_fields = ?'); params.push(JSON.stringify(data.inputFields)); }
        if (data.maxExecTimeSecs !== undefined) { fields.push('max_exec_time_secs = ?'); params.push(data.maxExecTimeSecs); }

        params.push(data.id);
        await this.db.run(`UPDATE workflow_configs SET ${fields.join(', ')} WHERE id = ?`, params);

        return this.getWorkflow(data.id);
    }

    async deleteWorkflow(id: string): Promise<void> {
        await this.getWorkflow(id);
        await this.db.run('DELETE FROM workflow_executions WHERE workflow_id = ?', [id]);
        await this.db.run('DELETE FROM workflow_trigger_map WHERE workflow_id = ?', [id]);
        await this.db.run('DELETE FROM workflow_configs WHERE id = ?', [id]);
    }

    async touchUpdatedAt(id: string): Promise<void> {
        await this.db.run(
            `UPDATE workflow_configs SET updated_at = ? WHERE id = ?`,
            [new Date().toISOString(), id]
        );
    }

    // --- Triggers ---

    async createTrigger(data: WorkflowTriggerCreateRequest): Promise<WorkflowTrigger> {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await this.db.run(
            `INSERT INTO triggers (id, type, data, created_at) VALUES (?, ?, ?, ?)`,
            [id, data.type, data.data, now]
        );
        return this.getTrigger(id);
    }

    async getTrigger(id: string): Promise<WorkflowTrigger> {
        const row = await this.db.get<TriggerRow>('SELECT * FROM triggers WHERE id = ?', [id]);
        if (!row) throw new Error(`Trigger not found: ${id}`);
        return rowToTrigger(row);
    }

    async updateTrigger(data: WorkflowTriggerUpdatePayload): Promise<WorkflowTrigger> {
        await this.getTrigger(data.id);
        const fields: string[] = [];
        const params: any[] = [];
        if (data.type !== undefined) { fields.push('type = ?'); params.push(data.type); }
        if (data.data !== undefined) { fields.push('data = ?'); params.push(data.data); }
        if (fields.length > 0) {
            params.push(data.id);
            await this.db.run(`UPDATE triggers SET ${fields.join(', ')} WHERE id = ?`, params);
        }
        return this.getTrigger(data.id);
    }

    async deleteTrigger(id: string): Promise<void> {
        await this.db.run('DELETE FROM workflow_trigger_map WHERE trigger_id = ?', [id]);
        await this.db.run('DELETE FROM triggers WHERE id = ?', [id]);
    }

    async listTriggers(params?: ListTriggersParams): Promise<WorkflowTrigger[]> {
        if (params?.workflowId) {
            return this.getTriggersForWorkflow(params.workflowId);
        }
        const rows = await this.db.all<TriggerRow>('SELECT * FROM triggers ORDER BY created_at DESC');
        return rows.map(rowToTrigger);
    }

    async getTriggersForWorkflow(workflowId: string): Promise<WorkflowTrigger[]> {
        const rows = await this.db.all<TriggerRow>(
            `SELECT t.* FROM triggers t
             INNER JOIN workflow_trigger_map m ON t.id = m.trigger_id
             WHERE m.workflow_id = ?`,
            [workflowId]
        );
        return rows.map(rowToTrigger);
    }

    async linkTrigger(workflowId: string, triggerId: string): Promise<void> {
        await this.getWorkflow(workflowId);
        await this.getTrigger(triggerId);
        await this.db.run(
            `INSERT OR IGNORE INTO workflow_trigger_map (workflow_id, trigger_id) VALUES (?, ?)`,
            [workflowId, triggerId]
        );
    }

    async unlinkTrigger(workflowId: string, triggerId: string): Promise<void> {
        await this.db.run(
            `DELETE FROM workflow_trigger_map WHERE workflow_id = ? AND trigger_id = ?`,
            [workflowId, triggerId]
        );
    }

    async getWorkflowsForTrigger(triggerId: string): Promise<WorkflowConfig[]> {
        const rows = await this.db.all<ConfigRow>(
            `SELECT c.* FROM workflow_configs c
             INNER JOIN workflow_trigger_map m ON c.id = m.workflow_id
             WHERE m.trigger_id = ? AND c.is_enabled = 1`,
            [triggerId]
        );
        return rows.map(rowToWorkflowConfig);
    }

    // --- Executions ---

    async createExecution(
        workflowId: string | null,
        opts?: { script?: string; triggerId?: string; inputs?: WorkflowInputs },
    ): Promise<WorkflowExecution> {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await this.db.run(
            `INSERT INTO workflow_executions (id, workflow_id, script, trigger_id, inputs_json, started_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, workflowId, opts?.script ?? null, opts?.triggerId ?? null,
                opts?.inputs ? JSON.stringify(opts.inputs) : null, now]
        );

        return this.getExecution(id);
    }

    async updateExecution(id: string, result: WorkflowExecutionResult, endedAt: Date): Promise<void> {
        await this.db.run(
            `UPDATE workflow_executions SET result_json = ?, ended_at = ? WHERE id = ?`,
            [JSON.stringify(result), endedAt.toISOString(), id]
        );
    }

    async getExecution(id: string): Promise<WorkflowExecution> {
        const row = await this.db.get<ExecutionRow>(
            'SELECT * FROM workflow_executions WHERE id = ?', [id]
        );
        if (!row) throw new Error(`Execution not found: ${id}`);
        return rowToWorkflowExecution(row);
    }

    async listExecutions(params?: ListWorkflowExecutionsParams): Promise<WorkflowExecution[]> {
        let sql = 'SELECT * FROM workflow_executions';
        const sqlParams: any[] = [];
        const conditions: string[] = [];

        if (params?.workflowId !== undefined) {
            conditions.push('workflow_id = ?');
            sqlParams.push(params.workflowId);
        }

        if (params?.status !== undefined) {
            conditions.push("json_extract(result_json, '$.status') = ?");
            sqlParams.push(params.status);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        const sortCol = ({ startedAt: 'started_at', endedAt: 'ended_at' } as const)[params?.sortBy ?? 'startedAt'] ?? 'started_at';
        const sortDir = params?.sortDirection === 'asc' ? 'ASC' : 'DESC';
        sql += ` ORDER BY ${sortCol} ${sortDir}`;

        if (params?.limit !== undefined) {
            sql += ' LIMIT ?';
            sqlParams.push(params.limit);
        }
        if (params?.offset !== undefined) {
            sql += ' OFFSET ?';
            sqlParams.push(params.offset);
        }

        const rows = await this.db.all<ExecutionRow>(sql, sqlParams);
        return rows.map(rowToWorkflowExecution);
    }

    async pruneExecutions(workflowId: string | null, maxCount: number = 20): Promise<string[]> {
        const whereClause = workflowId !== null
            ? 'WHERE workflow_id = ?'
            : 'WHERE workflow_id IS NULL';
        const params: any[] = workflowId !== null ? [workflowId] : [];

        const rows = await this.db.all<{ id: string }>(
            `SELECT id FROM workflow_executions ${whereClause}
             ORDER BY started_at DESC LIMIT -1 OFFSET ?`,
            [...params, maxCount]
        );

        if (rows.length === 0) return [];

        const ids = rows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        await this.db.run(`DELETE FROM workflow_executions WHERE id IN (${placeholders})`, ids);

        return ids;
    }
}
