import { Database } from "bun:sqlite";
import type { PulseEvent } from "./protocol";

export function openDb(path: string) {
  const db = new Database(path);
  db.run(`
    create table if not exists events (
      id integer primary key autoincrement,
      kind text not null,
      created_at text not null,
      label text,
      level text,
      message text,
      task_id text,
      method text,
      url text,
      status_code integer,
      error text,
      request_body_size integer,
      response_body_size integer,
      payload_json text not null
    )
  `);

  const recent = db.query<PulseEvent, [number]>(`
    select
      kind,
      created_at as createdAt,
      label,
      level,
      message,
      task_id as taskId,
      method,
      url,
      status_code as statusCode,
      error,
      request_body_size as requestBodySize,
      response_body_size as responseBodySize,
      payload_json as payloadJson
    from (
      select *
      from events
      order by id desc
      limit ?
    )
    order by id asc
  `);

  return {
    close() {
      db.close();
    },
    insert(event: PulseEvent) {
      db.run(
        `
          insert into events (
            kind,
            created_at,
            label,
            level,
            message,
            task_id,
            method,
            url,
            status_code,
            error,
            request_body_size,
            response_body_size,
            payload_json
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          event.kind,
          event.createdAt,
          event.label,
          event.level,
          event.message,
          event.taskId,
          event.method,
          event.url,
          event.statusCode,
          event.error,
          event.requestBodySize,
          event.responseBodySize,
          event.payloadJson,
        ],
      );
    },
    list(limit = 200) {
      return recent.all(limit);
    },
    path,
  };
}
