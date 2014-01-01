/*global angular*/
(function (module) {

  var uid = [0, 0, 0];
  var toString = Object.prototype.toString;

  function hashKey(obj) {
    var objType = typeof obj,
        key;

    if (objType == 'object' && obj !== null) {
      if (typeof (key = obj.$$hashKey) == 'function') {
        // must invoke on object to keep the right this
        key = obj.$$hashKey();
      } else if (key === undefined) {
        key = obj.$$hashKey = nextUid();
      }
    } else {
      key = obj;
    }

    return objType + ':' + key;
  }

  function nextUid() {
    var index = uid.length;
    var digit;

    while(index) {
      index--;
      digit = uid[index].charCodeAt(0);
      if (digit == 57 /*'9'*/) {
        uid[index] = 'A';
        return uid.join('');
      }
      if (digit == 90  /*'Z'*/) {
        uid[index] = '0';
      } else {
        uid[index] = String.fromCharCode(digit + 1);
        return uid.join('');
      }
    }
    uid.unshift('0');
    return uid.join('');
  }

  function isArrayLike(obj) {
    if (!obj || (typeof obj.length !== 'number')) {
      return false;
    }

    // We have on object which has length property. Should we treat it as array?
    if (typeof obj.hasOwnProperty != 'function' &&
        typeof obj.constructor != 'function') {
      // This is here for IE8: it is a bogus object treat it as array;
      return true;
    } else  {
      return obj instanceof angular.element ||
              toString.call(obj) !== '[object Object]' ||   // some browser native object
              typeof obj.callee === 'function';              // arguments (on IE8 looks like regular obj)
    }
  }

  var ngDeferRepeatDirective = ['$parse', '$animator', '$queueFactory', function($parse, $animator, $queueFactory) {
    var NG_REMOVED = '$$NG_REMOVED';

    /**
     * Request for a certain queue, create one if not exists
     *
     * @param   {number}  limit   concurrent tasks limit
     * @return  {object}          requested queue
     */
    var getQueue = (function () {
      var _queuePool = {};

      return function (limit) {
        if (angular.isUndefined(_queuePool[limit])) {
          _queuePool[limit] = $queueFactory(limit, true);
        }
        return _queuePool[limit];
      };
    }());

    return {
      transclude: 'element',
      priority: 1000,
      terminal: true,
      compile: function(element, attr, linker) {
        return function($scope, $element, $attr){
          var animate = $animator($scope, $attr);
          var expression = $attr.ngDeferRepeat;
          var match = expression.match(/^\s*(.+)\s+in\s+(.*?)\s*(\s+track\s+by\s+(.+)\s*)?$/),
            trackByExp, trackByExpGetter, trackByIdFn, lhs, rhs, valueIdentifier, keyIdentifier,
            hashFnLocals = {$id: hashKey};

          var queue = getQueue(1);

          if (!match) {
            throw Error("Expected ngDeferRepeat in form of '_item_ in _collection_[ track by _id_]' but got '" +
              expression + "'.");
          }

          lhs = match[1];
          rhs = match[2];
          trackByExp = match[4];

          if (trackByExp) {
            trackByExpGetter = $parse(trackByExp);
            trackByIdFn = function(key, value, index) {
              // assign key, value, and $index to the locals so that they can be used in hash functions
              if (keyIdentifier) {
                hashFnLocals[keyIdentifier] = key;
              }
              hashFnLocals[valueIdentifier] = value;
              hashFnLocals.$index = index;
              return trackByExpGetter($scope, hashFnLocals);
            };
          } else {
            trackByIdFn = function(key, value) {
              return hashKey(value);
            };
          }

          match = lhs.match(/^(?:([\$\w]+)|\(([\$\w]+)\s*,\s*([\$\w]+)\))$/);
          if (!match) {
            throw Error("'item' in 'item in collection' should be identifier or (key, value) but got '" +
                lhs + "'.");
          }
          valueIdentifier = match[3] || match[1];
          keyIdentifier = match[2];

          // Store a list of elements from previous run. This is a hash where key is the item from the
          // iterator, and the value is objects with following properties.
          //   - scope: bound scope
          //   - element: previous element.
          //   - index: position
          var lastBlockMap = {};

          //watch props
          $scope.$watchCollection(rhs, function ngDeferRepeatAction(collection){
            var index, length,
                cursor = $element,     // current position of the node
                nextCursor,
                // Same as lastBlockMap but it has the current state. It will become the
                // lastBlockMap on the next iteration.
                nextBlockMap = {},
                arrayLength,
                childScope,
                key, value, // key/value of iteration
                trackById,
                collectionKeys,
                block,       // last object information {scope, element, id}
                nextBlockOrder = [];

            var blockItrFunc = function(block) {
              if (block && block.element) {
                lastBlockMap[block.id] = block;
              }
            };

            var linkerFuncGen = function (block) {
              return function(clone) {
                queue.enqueue(function () {
                  animate.enter(clone, null, cursor);
                  cursor = clone;
                  block.scope = childScope;
                  block.element = clone;
                  nextBlockMap[block.id] = block;
                });
              };
            };

            if (isArrayLike(collection)) {
              collectionKeys = collection;
            } else {
              // if object, extract keys, sort them and use to determine order of iteration over obj props
              collectionKeys = [];
              for (key in collection) {
                if (collection.hasOwnProperty(key) && key.charAt(0) != '$') {
                  collectionKeys.push(key);
                }
              }
              collectionKeys.sort();
            }

            arrayLength = collectionKeys.length;

            // locate existing items
            length = nextBlockOrder.length = collectionKeys.length;
            for(index = 0; index < length; index++) {
             key = (collection === collectionKeys) ? index : collectionKeys[index];
             value = collection[key];
             trackById = trackByIdFn(key, value, index);
             if(lastBlockMap.hasOwnProperty(trackById)) {
               block = lastBlockMap[trackById];
               delete lastBlockMap[trackById];
               nextBlockMap[trackById] = block;
               nextBlockOrder[index] = block;
             } else if (nextBlockMap.hasOwnProperty(trackById)) {
               // restore lastBlockMap
               angular.forEach(nextBlockOrder, blockItrFunc);
               // This is a duplicate and we need to throw an error
               throw new Error('Duplicates in a repeater are not allowed. Repeater: ' + expression +
                   ' key: ' + trackById);
             } else {
               // new never before seen block
               nextBlockOrder[index] = { id: trackById };
               nextBlockMap[trackById] = false;
             }
           }

            // remove existing items
            for (key in lastBlockMap) {
              if (lastBlockMap.hasOwnProperty(key)) {
                block = lastBlockMap[key];
                animate.leave(block.element);
                block.element[0][NG_REMOVED] = true;
                block.scope.$destroy();
              }
            }

            // we are not using forEach for perf reasons (trying to avoid #call)
            for (index = 0, length = collectionKeys.length; index < length; index++) {
              key = (collection === collectionKeys) ? index : collectionKeys[index];
              value = collection[key];
              block = nextBlockOrder[index];

              if (block.element) {
                // if we have already seen this object, then we need to reuse the
                // associated scope/element
                childScope = block.scope;

                nextCursor = cursor[0];
                do {
                  nextCursor = nextCursor.nextSibling;
                } while(nextCursor && nextCursor[NG_REMOVED]);

                if (block.element[0] == nextCursor) {
                  // do nothing
                  cursor = block.element;
                } else {
                  // existing item which got moved
                  animate.move(block.element, null, cursor);
                  cursor = block.element;
                }
              } else {
                // new item which we don't know about
                childScope = $scope.$new();
              }

              childScope[valueIdentifier] = value;
              if (keyIdentifier) {
                childScope[keyIdentifier] = key;
              }
              childScope.$index = index;
              childScope.$first = (index === 0);
              childScope.$last = (index === (arrayLength - 1));
              childScope.$middle = !(childScope.$first || childScope.$last);

              if (!block.element) {
                linker(childScope, linkerFuncGen(block));
              }
            }
            lastBlockMap = nextBlockMap;
          });
        };
      }
    };
  }];

  module.directive('ngDeferRepeat', ngDeferRepeatDirective);

})(angular.module('ngDefer'));
