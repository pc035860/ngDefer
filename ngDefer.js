/*global angular*/

angular.module('ngDefer', ['ngQueue'])

.directive('ngDefer', [
         '$queueFactory', '$animate', '$document',
function ($queueFactory,   $animate,   $document) {
  /**
   * Request for a certain queue, create one if not exists
   *
   * @param   {number}  limit   concurrent tasks limit
   * @return  {object}          requested queue
   */
  var getQueue = (function () {
    var _queuePool = {};

    return function (chunkDuration) {
      if (angular.isUndefined(_queuePool[chunkDuration])) {
        _queuePool[chunkDuration] = $queueFactory(1, chunkDuration);
      }
      return _queuePool[chunkDuration];
    };
  }());

  return {
    multiElement: true,
    transclude: 'element',
    priority: 999,  // the priority is slightly lower ngRepeat
    terminal: true,
    restrict: 'A',
    $$tlb: true,
    link: function ($scope, $element, $attr, ctrl, $transclude) {
      var stopWatch, task;

      var chunkDuration = Number($attr.ngDefer) || 0,
          queue = getQueue(chunkDuration);

      var block, childScope, previousElements;

      stopWatch = $scope.$watch(function () { return true; }, function () {
        task = queue.enqueue(function () {
          task = null;

          $transclude(function(clone, newScope) {
            childScope = newScope;
            clone[clone.length++] = $document[0].createComment(' end ngDefer ');
            // Note: We only need the first/last node of the cloned nodes.
            // However, we need to keep the reference to the jqlite wrapper as it might be changed later
            // by a directive with templateUrl when its template arrives.
            block = {
              clone: clone
            };
            $animate.enabled(false, clone);
            $animate.enter(clone, $element.parent(), $element);
          });
        });

        // Clear watch after one-time trigger
        stopWatch();
      });

      $scope.$on('$destroy', function () {
        // Haven't triggered
        if (task !== null) {
          queue.remove(task);
        }

        if (childScope) {
          childScope.$destroy();
          childScope = null;
        }
        if (block) {
          previousElements = getBlockNodes(block.clone);
          $animate.enabled(false, previousElements);
          $animate.leave(previousElements).then(function() {
            previousElements = null;
          });
          block = null;
        }
      });
    }
  };

  /**
   * Return the DOM siblings between the first and last node in the given array.
   * @param {Array} array like object
   * @returns {Array} the inputted object or a jqLite collection containing the nodes
   */
  function getBlockNodes(nodes) {
    // TODO(perf): update `nodes` instead of creating a new object?
    var node = nodes[0];
    var endNode = nodes[nodes.length - 1];
    var blockNodes;

    for (var i = 1; node !== endNode && (node = node.nextSibling); i++) {
      if (blockNodes || nodes[i] !== node) {
        if (!blockNodes) {
          blockNodes = angular.element(
            Array.prototype.slice.call(nodes, 0, i)
          );
        }
        blockNodes.push(node);
      }
    }

    return blockNodes || nodes;
  }
}]);
