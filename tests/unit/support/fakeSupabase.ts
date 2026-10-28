/**
 * A small in-memory stand-in for the Supabase query builder, used only at the
 * client boundary in route tests. It keeps rows in plain arrays and enforces the
 * two database rules the busy-week flow depends on: the weekly_plan unique index
 * (user, week, day, meal slot) and the generation_batches primary key.
 */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Result = { data: unknown; error: { code?: string; message: string } | null };

export type FakeRpcResult = { data: unknown; error: { code?: string; message: string } | null };

export type FakeDb = {
  tables: Tables;
  /** Optional hook: return an error to make an insert fail. */
  failInsert?: (table: string, row: Row) => { code?: string; message: string } | null;
  /** Stand-in for the database functions the routes call with `rpc`. */
  rpc?: (name: string, args: Record<string, unknown>) => FakeRpcResult;
};

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

function insertOne(db: FakeDb, table: string, values: Row): Result {
  const injected = db.failInsert?.(table, values);
  if (injected) return { data: null, error: injected };

  const rows = (db.tables[table] ??= []);
  const row: Row = { id: newId(), created_at: new Date().toISOString(), ...values };

  if (table === "generation_batches") {
    if (rows.some((existing) => existing.id === row.id)) {
      return { data: null, error: { code: "23505", message: "duplicate key value" } };
    }
  }

  if (table === "weekly_plan" && row.day_of_week !== null && row.day_of_week !== undefined) {
    const clash = rows.some(
      (existing) =>
        existing.user_id === row.user_id &&
        existing.week_start === row.week_start &&
        existing.day_of_week === row.day_of_week &&
        existing.meal_slot === row.meal_slot
    );
    if (clash) {
      return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    }
  }

  rows.push(row);
  return { data: row, error: null };
}

function matches(row: Row, filters: Array<(row: Row) => boolean>): boolean {
  return filters.every((filter) => filter(row));
}

function createBuilder(db: FakeDb, table: string) {
  const state: {
    op: "select" | "insert" | "update" | "delete";
    values: Row | Row[] | null;
    filters: Array<(row: Row) => boolean>;
    single: "none" | "single" | "maybe";
    returning: boolean;
  } = { op: "select", values: null, filters: [], single: "none", returning: false };

  const execute = (): Result => {
    const rows = (db.tables[table] ??= []);

    if (state.op === "insert") {
      const values = Array.isArray(state.values) ? state.values : [state.values as Row];
      const inserted: Row[] = [];
      for (const value of values) {
        const result = insertOne(db, table, value);
        if (result.error) return result;
        inserted.push(result.data as Row);
      }
      if (!state.returning) return { data: null, error: null };
      return finish(inserted);
    }

    const matching = rows.filter((row) => matches(row, state.filters));

    if (state.op === "update") {
      for (const row of matching) Object.assign(row, state.values);
      return finish(matching.map((row) => ({ ...row })));
    }

    if (state.op === "delete") {
      for (const row of matching) rows.splice(rows.indexOf(row), 1);
      return { data: null, error: null };
    }

    return finish(matching.map((row) => ({ ...row })));
  };

  const finish = (rows: Row[]): Result => {
    if (state.single === "single") {
      if (rows.length !== 1) return { data: null, error: { code: "PGRST116", message: "expected one row" } };
      return { data: rows[0], error: null };
    }
    if (state.single === "maybe") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  };

  const api = {
    select() {
      state.returning = true;
      return api;
    },
    insert(values: Row | Row[]) {
      state.op = "insert";
      state.values = values;
      return api;
    },
    update(values: Row) {
      state.op = "update";
      state.values = values;
      return api;
    },
    delete() {
      state.op = "delete";
      return api;
    },
    eq(column: string, value: unknown) {
      state.filters.push((row) => row[column] === value);
      return api;
    },
    in(column: string, values: unknown[]) {
      state.filters.push((row) => values.includes(row[column]));
      return api;
    },
    lt(column: string, value: unknown) {
      state.filters.push((row) => String(row[column]) < String(value));
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    single() {
      state.single = "single";
      return api;
    },
    maybeSingle() {
      state.single = "maybe";
      return api;
    },
    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ) {
      return Promise.resolve().then(execute).then(onfulfilled, onrejected);
    },
  };
  return api;
}

/** Builds a client with a `from(table)` method, the only surface the routes use. */
export function createFakeSupabase(db: FakeDb) {
  return {
    from(table: string) {
      return createBuilder(db, table);
    },
    rpc(name: string, args: Record<string, unknown>) {
      const result = db.rpc?.(name, args) ?? { data: null, error: { message: `No fake for ${name}` } };
      return Promise.resolve(result);
    },
  };
}
