import { DropIndexNode } from '../operation-node/drop-index-node.js'
import { OperationNodeSource } from '../operation-node/operation-node-source.js'
import { CompiledQuery } from '../query-compiler/compiled-query.js'
import { Compilable } from '../util/compilable.js'
import { preventAwait } from '../util/prevent-await.js'
import { QueryExecutor } from '../query-executor/query-executor.js'
import { QueryId } from '../util/query-id.js'

export class DropIndexBuilder implements OperationNodeSource, Compilable {
  readonly #queryId: QueryId
  readonly #dropIndexNode: DropIndexNode
  readonly #executor: QueryExecutor

  constructor(args: DropIndexBuilderConstructorArgs) {
    this.#queryId = args.queryId
    this.#dropIndexNode = args.dropIndexNode
    this.#executor = args.executor
  }

  ifExists(): DropIndexBuilder {
    return new DropIndexBuilder({
      queryId: this.#queryId,
      executor: this.#executor,
      dropIndexNode: DropIndexNode.cloneWithModifier(
        this.#dropIndexNode,
        'IfExists'
      ),
    })
  }

  toOperationNode(): DropIndexNode {
    return this.#executor.transformQuery(this.#dropIndexNode, this.#queryId)
  }

  compile(): CompiledQuery {
    return this.#executor.compileQuery(this.toOperationNode(), this.#queryId)
  }

  async execute(): Promise<void> {
    await this.#executor.executeQuery(this.compile(), this.#queryId)
  }
}

preventAwait(
  DropIndexBuilder,
  "don't await DropIndexBuilder instances directly. To execute the query you need to call `execute`"
)

export interface DropIndexBuilderConstructorArgs {
  queryId: QueryId
  dropIndexNode: DropIndexNode
  executor: QueryExecutor
}
