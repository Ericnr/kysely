import { QueryBuilder } from './query-builder.js'
import { SelectQueryNode } from '../operation-node/select-query-node.js'
import {
  parseTableExpressionOrList,
  TableExpression,
  QueryBuilderWithTable,
} from '../parser/table-parser.js'
import { NeverExecutingQueryExecutor } from '../query-executor/never-executing-query-executor.js'
import { WithSchemaPlugin } from '../plugin/with-schema/with-schema-plugin.js'
import { createQueryId } from '../util/query-id.js'

export class SubQueryBuilder<DB, TB extends keyof DB> {
  readonly #executor: NeverExecutingQueryExecutor

  constructor(
    executor: NeverExecutingQueryExecutor = new NeverExecutingQueryExecutor()
  ) {
    this.#executor = executor
  }

  /**
   * Creates a subquery.
   *
   * The query builder returned by this method is typed in a way that you can refer to
   * all tables of the parent query in addition to the subquery's tables.
   *
   * @example
   * This example shows that you can refer to both `pet.owner_id` and `person.id`
   * columns from the subquery. This is needed to be able to create correlated
   * subqueries:
   *
   * ```ts
   * const result = await db.selectFrom('pet')
   *   .select([
   *     'pet.name',
   *     (qb) => qb.subQuery('person')
   *       .whereRef('person.id', '=', 'pet.owner_id')
   *       .select('person.first_name')
   *       .as('owner_name')
   *   ])
   *   .execute()
   *
   * console.log(result[0].owner_name)
   * ```
   *
   * The generated SQL (postgresql):
   *
   * ```sql
   * select
   *   "pet"."name",
   *   ( select "person"."first_name"
   *     from "person"
   *     where "person"."id" = "pet"."owner_id"
   *   ) as "owner_name"
   * from "pet"
   * ```
   *
   * You can use a normal query in place of `(qb) => qb.subQuery(...)` but in
   * that case Kysely typings wouldn't allow you to reference `pet.owner_id`
   * because `pet` is not joined to that query.
   */
  subQuery<F extends TableExpression<DB, TB>>(
    from: F[]
  ): QueryBuilderWithTable<DB, TB, {}, F>

  subQuery<F extends TableExpression<DB, TB>>(
    from: F
  ): QueryBuilderWithTable<DB, TB, {}, F>

  subQuery(table: any): any {
    return new QueryBuilder({
      queryId: createQueryId(),
      executor: this.#executor,
      queryNode: SelectQueryNode.create(parseTableExpressionOrList(table)),
    })
  }

  /**
   * See {@link QueryCreator.withSchema}
   */
  withSchema(schema: string): SubQueryBuilder<DB, TB> {
    return new SubQueryBuilder(
      this.#executor.withPluginAtFront(new WithSchemaPlugin(schema))
    )
  }
}
