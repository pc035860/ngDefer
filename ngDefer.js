/*global angular*/

angular.module('ngDefer', ['ngQueue'])

.directive('ngDefer', [
         '$queueFactory',
function ($queueFactory) {
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
    transclude: 'element',
    priority: 999,  // the priority is slightly lower ngRepeat
    terminal: true,
    restrict: 'A',
    compile: function (tElm, tAttrs, transclude) {
      return function postLink(scope, iElm, iAttrs) {
        var stopWatch, task;

        var chunkDuration = Number(iAttrs.ngDefer) || 0,
            queue = getQueue(chunkDuration);

        var childElement;

        stopWatch = scope.$watch(function () {
          return true;
        }, function () {
          task = queue.enqueue(function () {
            task = null;

            transclude(scope, function (clone) {
              var parent = iElm.parent(),
                  afterNode = iElm && iElm[iElm.length - 1],
                  parentNode = (parent && parent[0]) || (afterNode && afterNode.parentNode),
                  afterNextSibling = (afterNode && afterNode.nextSibling) || null;

              angular.forEach(clone, function (node) {
                parentNode.insertBefore(node, afterNextSibling);
              });

              childElement = clone;

              /**
               * Or ?
               *
               * iElm.after(clone);
               */
            });
          });

          // Clear watch after one-time trigger
          stopWatch();
        });

        scope.$on('$destroy', function () {
          // Haven't triggered
          if (task !== null) {
            queue.remove(task);
          }

          if (childElement) {
            childElement.remove();
          }
        });
      };
    }
  };
}]);
