module.exports = function(grunt) {
  "use strict";

  process.env.TEST = 'test';

  // Project configuration.
  grunt.initConfig({
    env : {
      options : {
        globalOption : 'foo'
      },
      testData : {
        TEST : 'test',
        data : 'bar'
      },
      testOptions : {
        options : {
          localOption : 'baz',
          USER: 'fritz'
        }
      },
      testDotEnv : {
        src : ['.env', '.env.json']
      },
      testDirectives : {
        ADD_NEGATIVE : 'should not change',
        PATHLIKE : 'foo:bar:baz',
        UNSHIFTBASIC : 'bar',
        UNSHIFTOBJECT : 'bar',
        REPLACE : 'foo',

        options : {
          add : {
            ADD_POSITIVE : 'should be this',
            ADD_NEGATIVE : 'should not change to this'
          },
          replace : {
            REPLACE : 'bar',
            REPLACE_NEGATIVE : '',
          },
          push : {
            PATHLIKE : {
              value : 'qux',
              delimiter : ':'
            }
          },
          unshift : {
            UNSHIFTBASIC : 'foo',
            UNSHIFTOBJECT : {
              value : 'foo'
            }

          }
        }
      }
    },
    clean : {
      env : ['.env*']
    },
    jshint: {
      options: {
        jshintrc : '.jshintrc'
      },
      task : ['tasks/**/*.js']
    }
  });

  // Load local tasks.
  grunt.loadTasks('tasks');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');

  var assert = require('assert');

  grunt.registerTask('testData', function(){
    assert.equal(process.env.globalOption, 'foo', 'globalOption should be set');
    assert.equal(process.env.data, 'bar', 'data should be set');
    delete process.env.globalOption;
    delete process.env.data;
  });

  grunt.registerTask('testOptions', function(){
    assert.equal(process.env.globalOption, 'foo', 'globalOption should be set');
    assert.equal(process.env.localOption, 'baz', 'localOption should be set');
    delete process.env.globalOption;
    delete process.env.localOption;
  });

  grunt.registerTask('testDirectives', function(){
    assert.equal(process.env.ADD_NEGATIVE, 'should not change', 'add should not change existing env var');
    assert.equal(process.env.ADD_POSITIVE, 'should be this', 'add should create new var if it does not exist');
    assert.equal(process.env.PATHLIKE, 'foo:bar:baz:qux', 'extend should take delimiters into account');
    assert.equal(process.env.UNSHIFTBASIC, 'foobar', 'should extend without specifying object');
    assert.equal(process.env.UNSHIFTOBJECT, 'foobar', 'should extend while specifying object');
    assert.equal(process.env.REPLACE, 'bar', 'replace should replace existing var');
    delete process.env.ADD_NEGATIVE;
    delete process.env.ADD_POSITIVE;
    delete process.env.PATHLIKE;
    delete process.env.UNSHIFTBASIC;
    delete process.env.UNSHIFTOBJECT;
    delete process.env.REPLACE;
    delete process.env.globalOption;
  });

  grunt.registerTask('writeDotEnv', function(){
    grunt.file.write('.env', "dotEnvFileData=bar\ndotEnvFileOption=baz");
    grunt.file.write('.env.json', '{"jsonValue" : "foo","push" : {"PATHLIKE":"jsonPath"}}');
  });

  grunt.registerTask('testDotEnv', function(){
    assert(!process.env.src, 'Should not include src');
    assert.equal(process.env.jsonValue, 'foo', 'value from json env file should be set');
    assert.equal(process.env.PATHLIKE, 'jsonPath', 'should process directives in json');
    assert.equal(process.env.globalOption, 'foo', 'should still get global options');
    assert.equal(process.env.dotEnvFileData, 'bar', 'dotEnvFileData should be set');
    assert.equal(process.env.dotEnvFileOption, 'baz', 'dotEnvFileOption should be set');
    delete process.env.jsonValue;
    delete process.env.dotEnvFileData;
    delete process.env.dotEnvFileOption;
    delete process.env.PATHLIKE;
    delete process.env.globalOption;
  });

  // Default task.
  grunt.registerTask('default', [
    'clean',
    'jshint',
    'env:testData',
    'testData',
    'env:testOptions',
    'testOptions',
    'writeDotEnv',
    'env:testDotEnv',
    'testDotEnv',
    'env:testDirectives',
    'testDirectives',
    'clean'
  ]);

};
