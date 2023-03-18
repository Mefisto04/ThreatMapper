import classNames from 'classnames';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiMinus, HiPlus } from 'react-icons/hi';
import { ActionFunctionArgs, useFetcher } from 'react-router-dom';
import { useInterval } from 'react-use';
import {
  Badge,
  CircleSpinner,
  createColumnHelper,
  ExpandedState,
  getRowSelectionColumn,
  RowSelectionState,
  SortingState,
  Table,
  TableSkeleton,
} from 'ui-components';

import { getTopologyApiClient } from '@/api/api';
import { ApiDocsGraphResult, DetailedNodeSummary } from '@/api/generated';
import { DFLink } from '@/components/DFLink';
import { TopologyAction } from '@/features/topology/types/graph';
import { TopologyTreeData } from '@/features/topology/types/table';
import { itemExpands } from '@/features/topology/utils/expand-collapse';
import {
  getExpandedIdsFromTreeData,
  getIdsFromTreeData,
  GraphStorageManager,
  NodeType,
} from '@/features/topology/utils/topology-data';
import { ApiError, makeRequest } from '@/utils/api';

interface ActionData {
  data: ApiDocsGraphResult;
  action?: TopologyAction;
}

const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const formData = await request.formData();
  const action = JSON.parse(
    (formData.get('action') as string) ?? 'undefined',
  ) as ActionData['action'];
  const filters = JSON.parse(formData.get('filters') as string) as ReturnType<
    GraphStorageManager['getFilters']
  >;
  const graphData = await makeRequest({
    apiFunction: getTopologyApiClient().getCloudTopologyGraph,
    apiArgs: [
      {
        graphTopologyFilters: {
          ...filters,
          field_filters: {
            contains_filter: { filter_in: {} },
            match_filter: { filter_in: {} },
            order_filter: { order_fields: [] },
          },
        },
      },
    ],
  });

  if (ApiError.isApiError(graphData)) {
    throw new Error('unknown response');
  }
  return {
    data: graphData,
    action: action,
  };
};

function TopologyCloudTable() {
  const { isRefreshInProgress, treeData, action, ...graphDataManagerFunctions } =
    useTableDataManager();
  const graphDataManagerFunctionsRef = useRef(graphDataManagerFunctions);

  graphDataManagerFunctionsRef.current = graphDataManagerFunctions;

  const [expandedState, setExpandedState] = useState<ExpandedState>({});
  const [sortingState, setSortingState] = useState<SortingState>([
    {
      id: 'label',
      desc: false,
    },
  ]);

  const columnHelper = createColumnHelper<(typeof treeData)[number]>();
  const [rowSelectionState, setRowSelectionState] = useState<RowSelectionState>({});

  useEffect(() => {
    graphDataManagerFunctionsRef.current.getDataUpdates({ type: 'refresh' });
  }, []);

  useInterval(() => {
    graphDataManagerFunctionsRef.current.getDataUpdates({ type: 'refresh' });
  }, 30000);

  const columns = useMemo(
    () => [
      getRowSelectionColumn(columnHelper, {
        minSize: 40,
        size: 40,
        maxSize: 40,
      }),
      columnHelper.accessor('label', {
        cell: (info) => {
          const { depth, original } = info.row;
          const isExpanding = isNodeExpandingOrCollapsing(original, action);
          return (
            <div
              style={{
                paddingLeft: `${depth * 22}px`,
              }}
              className="flex items-center"
            >
              {info.row.getCanExpand() && isExpanding ? (
                <CircleSpinner size="sm" />
              ) : null}
              {info.row.getCanExpand() && !isExpanding ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      graphDataManagerFunctionsRef.current.isNodeExpanded({
                        nodeId: original.id!,
                        nodeType: original.type!,
                      })
                    ) {
                      graphDataManagerFunctionsRef.current.getDataUpdates({
                        type: 'collapseNode',
                        nodeId: original.id!,
                        nodeType: original.type!,
                      });
                    } else {
                      graphDataManagerFunctionsRef.current.getDataUpdates({
                        type: 'expandNode',
                        nodeId: original.id!,
                        nodeType: original.type!,
                      });
                    }
                  }}
                >
                  {info.row.getIsExpanded() ? <HiMinus /> : <HiPlus />}
                </button>
              ) : null}
              {!info.row.getCanExpand() ? <span>&nbsp;&nbsp;&nbsp;</span> : null}
              <DFLink href="#" className="flex-1 shrink-0 truncate pl-2">
                {info.getValue()}
              </DFLink>
            </div>
          );
        },
        header: () => 'name',
        minSize: 400,
        size: 500,
        maxSize: 1000,
      }),
      columnHelper.accessor((row) => row.type, {
        id: 'type',
        cell: (info) => {
          return info.getValue?.()?.replaceAll('_', ' ');
        },
        header: () => <span>type</span>,
        minSize: 340,
        size: 400,
        maxSize: 500,
        enableSorting: false,
      }),
    ],
    [treeData, action],
  );

  useEffect(() => {
    setExpandedState(() => {
      return getExpandedIdsFromTreeData(treeData).reduce<Record<string, boolean>>(
        (prev, current) => {
          prev[current] = true;
          return prev;
        },
        {},
      );
    });

    setRowSelectionState((prev) => {
      if (!Object.keys(prev).length) return prev;
      return getIdsFromTreeData(treeData).reduce<Record<string, boolean>>(
        (acc, current) => {
          if (prev[current]) {
            acc[current] = true;
          }
          return acc;
        },
        {},
      );
    });
  }, [treeData]);

  if (isRefreshInProgress && !treeData.length) {
    return <TableSkeleton columns={2} rows={5} size="sm" />;
  }

  return (
    <>
      <Table
        size="sm"
        data={treeData}
        columns={columns}
        enableSorting
        enableRowSelection
        enableColumnResizing
        rowSelectionState={rowSelectionState}
        onRowSelectionChange={setRowSelectionState}
        expanded={expandedState}
        onExpandedChange={setExpandedState}
        sortingState={sortingState}
        onSortingChange={setSortingState}
        enableSubRowSelection={false}
        getRowId={(row) => {
          return row.id ?? '';
        }}
        getRowCanExpand={(row) => {
          return itemExpands(row.original);
        }}
        getSubRows={(row) => row.children ?? []}
      />
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      label={status.toUpperCase().replaceAll('_', ' ')}
      className={classNames({
        'bg-green-100 dark:bg-green-600/10 text-green-600 dark:text-green-400':
          status.toLowerCase() === 'complete',
        'bg-red-100 dark:bg-red-600/10 text-red-600 dark:text-red-400':
          status.toLowerCase() === 'error',
        'bg-blue-100 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400':
          status.toLowerCase() === 'in_progress',
      })}
      size="sm"
    />
  );
}

function isNodeExpandingOrCollapsing(node: DetailedNodeSummary, action?: TopologyAction) {
  if (
    (action?.type === 'expandNode' || action?.type === 'collapseNode') &&
    action?.nodeId === node.id
  ) {
    return true;
  }
  return false;
}

function useTableDataManager() {
  const [treeData, setTreeData] = useState<TopologyTreeData[]>([]);
  const [action, setAction] = useState<TopologyAction>();
  const [storageManager] = useState(new GraphStorageManager());

  const fetcher = useFetcher<ActionData>();
  const getDataUpdates = (action: ActionData['action']): void => {
    if (fetcher.state !== 'idle') return;
    if (action?.type === 'expandNode')
      storageManager.addNodeToFilters({
        nodeId: action.nodeId,
        nodeType: action.nodeType,
      });
    else if (action?.type === 'collapseNode')
      storageManager.removeNodeFromFilters({
        nodeId: action.nodeId,
        nodeType: action.nodeType,
      });
    fetcher.submit(
      {
        action: JSON.stringify(action),
        filters: JSON.stringify(storageManager.getFilters()),
      },
      { method: 'post' },
    );
    setAction(action);
  };
  useEffect(() => {
    if (!fetcher.data) return;
    storageManager.setGraphData(fetcher.data.data);
    setTreeData(storageManager.getTreeData({ rootNodeType: NodeType.cloud_provider }));
    setAction(undefined);
  }, [fetcher.data]);
  return {
    treeData,
    action,
    getDataUpdates,
    isNodeExpanded: storageManager.isNodeExpanded,
    isRefreshInProgress: fetcher.state !== 'idle',
  };
}

export const module = {
  action,
  element: <TopologyCloudTable />,
};
