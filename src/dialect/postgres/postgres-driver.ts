import { Pool, PoolClient, PoolConfig } from 'pg'
import {
  DatabaseConnection,
  QueryResult,
} from '../../driver/database-connection.js'
import { Driver } from '../../driver/driver.js'
import { CompiledQuery } from '../../query-compiler/compiled-query.js'
import { freeze, isFunction } from '../../util/object-utils.js'
import { PostgresDialectConfig } from './postgres-dialect.js'

const PRIVATE_RELEASE_METHOD = Symbol()

export class PostgresDriver extends Driver {
  readonly #config: PostgresDialectConfig
  readonly #connections = new WeakMap<PoolClient, DatabaseConnection>()
  #pool: Pool | null = null

  constructor(config: PostgresDialectConfig) {
    super()
    this.#config = config
  }

  protected override async init(): Promise<void> {
    // Import the `pg` module here instead at the top of the file
    // so that this file can be loaded by node without `pg` driver
    // installed. As you can see, there IS an import from `pg` at the
    // top level too, but that's only for types. It doesn't get compiled
    // into javascript. You can check the built javascript code.
    const PoolConstrucor = await importPgPool()

    // Use the `pg` module's own pool. All drivers should use the
    // pool provided by the database library if possible.
    this.#pool = new PoolConstrucor(this.#config)
  }

  protected override async acquireConnection(): Promise<DatabaseConnection> {
    const client = await this.#pool!.connect()
    let connection = this.#connections.get(client)

    if (!connection) {
      connection = new PostgresConnection(client)
      this.#connections.set(client, connection)

      // The driver must take care of calling `onCreateConnection` when a new
      // connection is created. The `pg` module doesn't provide an async hook
      // for the connection creation. We need to call the method explicitly.
      if (this.#config.onCreateConnection) {
        await this.#config.onCreateConnection(connection)
      }
    }

    return connection
  }

  protected override async releaseConnection(
    connection: DatabaseConnection
  ): Promise<void> {
    const pgConnection = connection as PostgresConnection
    pgConnection[PRIVATE_RELEASE_METHOD]()
  }

  protected override async destroy(): Promise<void> {
    if (this.#pool) {
      const pool = this.#pool
      this.#pool = null
      await pool.end()
    }
  }
}

async function importPgPool(): Promise<new (config: PoolConfig) => Pool> {
  try {
    // For this to work with both esm and cjs modules we need
    // this hacky crap here.
    const pg = (await import('pg')) as any

    if (isFunction(pg.Pool)) {
      return pg.Pool
    } else {
      // With esm the imported module doesn't match the typings.
      return pg.default.Pool
    }
  } catch (error) {
    throw new Error(
      'Postgres client not installed. Please run `npm install pg`'
    )
  }
}

class PostgresConnection implements DatabaseConnection {
  #client: PoolClient

  constructor(client: PoolClient) {
    this.#client = client
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const result = await this.#client.query<O>(compiledQuery.sql, [
      ...compiledQuery.bindings,
    ])

    return freeze({
      numUpdatedOrDeletedRows:
        result.command === 'UPDATE' || result.command === 'DELETE'
          ? result.rowCount
          : undefined,
      insertedPrimaryKey: undefined,
      rows: result.rows,
    })
  }

  [PRIVATE_RELEASE_METHOD](): void {
    this.#client.release()
  }
}
