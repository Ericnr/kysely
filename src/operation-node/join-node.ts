import { freeze } from '../util/object-utils.js'
import { AliasNode } from './alias-node.js'
import { AndNode } from './and-node.js'
import { FilterNode } from './filter-node.js'
import { OperationNode } from './operation-node.js'
import { OrNode } from './or-node.js'
import { ParensNode } from './parens-node.js'
import { TableNode } from './table-node.js'

export type JoinTableNode = TableNode | AliasNode
export type JoinType = 'InnerJoin' | 'LeftJoin' | 'RightJoin' | 'FullJoin'
export type JoinNodeOnNode = FilterNode | AndNode | OrNode | ParensNode

export interface JoinNode extends OperationNode {
  readonly kind: 'JoinNode'
  readonly joinType: JoinType
  readonly table: JoinTableNode
  readonly on?: JoinNodeOnNode
}

/**
 * @internal
 */
export const JoinNode = freeze({
  is(node: OperationNode): node is JoinNode {
    return node.kind === 'JoinNode'
  },

  create(joinType: JoinType, table: JoinTableNode): JoinNode {
    return freeze({
      kind: 'JoinNode',
      joinType,
      table,
      on: undefined,
    })
  },

  cloneWithOn(
    joinNode: JoinNode,
    op: 'And' | 'Or',
    on: JoinNodeOnNode
  ): JoinNode {
    return freeze({
      ...joinNode,
      on: joinNode.on
        ? op === 'And'
          ? AndNode.create(joinNode.on, on)
          : OrNode.create(joinNode.on, on)
        : on,
    })
  },
})
