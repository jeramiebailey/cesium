import {
  AttributeType,
  Buffer,
  Cartesian2,
  Cartesian3,
  Cartesian4,
  ComponentDatatype,
  DracoLoader,
  GltfBufferViewLoader,
  GltfDracoLoader,
  GltfLoader,
  GltfVertexBufferLoader,
  IndexDatatype,
  JobScheduler,
  PrimitiveType,
  Matrix4,
  Resource,
  ResourceCache,
  ResourceLoaderState,
  Sampler,
  TextureMagnificationFilter,
  TextureMinificationFilter,
  TextureWrap,
  when,
} from "../../Source/Cesium.js";
import concatTypedArrays from "../concatTypedArrays.js";
import createScene from "../createScene.js";
import pollToPromise from "../pollToPromise.js";

describe(
  "Scene/GltfLoader",
  function () {
    var boxInterleaved =
      "./Data/Models/GltfLoader/BoxInterleaved/glTF/BoxInterleaved.gltf";
    var boxTextured =
      "./Data/Models/GltfLoader/BoxTextured/glTF/BoxTextured.gltf";
    var boxTexturedBinary =
      "./Data/Models/GltfLoader/BoxTextured/glTF-Binary/BoxTextured.glb";
    var boxTexturedEmbedded =
      "./Data/Models/GltfLoader/BoxTextured/glTF-Embedded/BoxTextured.gltf";
    var boxVertexColors =
      "./Data/Models/GltfLoader/BoxVertexColors/glTF/BoxVertexColors.gltf";
    var simpleMorph =
      "./Data/Models/GltfLoader/SimpleMorph/glTF/SimpleMorph.gltf";
    var simpleSkin = "./Data/Models/GltfLoader/SimpleSkin/glTF/SimpleSkin.gltf";
    var triangleWithoutIndices =
      "./Data/Models/GltfLoader/TriangleWithoutIndices/glTF/TriangleWithoutIndices.gltf";
    var twoSidedPlane =
      "./Data/Models/GltfLoader/TwoSidedPlane/glTF/TwoSidedPlane.gltf";
    var unlitTest = "./Data/Models/GltfLoader/UnlitTest/glTF/UnlitTest.gltf";

    var scene;

    beforeAll(function () {
      scene = createScene();
    });

    afterAll(function () {
      scene.destroyForSpecs();
    });

    afterEach(function () {
      ResourceCache.clearForSpecs();
    });

    it("throws if gltfResource is undefined", function () {
      expect(function () {
        return new GltfVertexBufferLoader({
          gltfResource: undefined,
        });
      }).toThrowDeveloperError();
    });

    function loadGltf(gltfPath) {
      var resource = new Resource({
        url: gltfPath,
      });
      var gltfLoader = new GltfLoader({
        gltfResource: resource,
        incrementallyLoadTextures: false,
      });

      gltfLoader.load();

      return pollToPromise(function () {
        gltfLoader.process(scene.frameState);
        return gltfLoader._state === ResourceLoaderState.READY;
      }).then(function () {
        return gltfLoader.promise.then(function (gltfLoader) {
          return gltfLoader.components;
        });
      });
    }

    function getAttribute(attributes, semantic) {
      var attributesLength = attributes.length;
      for (var i = 0; i < attributesLength; ++i) {
        var attribute = attributes[i];
        if (attribute.semantic === semantic) {
          return attribute;
        }
      }
      return undefined;
    }

    it("loads BoxInterleaved", function () {
      return loadGltf(boxInterleaved).then(function (components) {
        var scene = components.scene;
        var rootNode = scene.nodes[0];
        var childNode = rootNode.children[0];
        var primitive = childNode.primitives[0];
        var attributes = primitive.attributes;
        var positionAttribute = getAttribute(attributes, "POSITION");
        var normalAttribute = getAttribute(attributes, "NORMAL");

        expect(positionAttribute.buffer).toBeDefined();
        expect(positionAttribute.byteOffset).toBe(12);
        expect(positionAttribute.byteStride).toBe(24);

        expect(normalAttribute.buffer).toBeDefined();
        expect(normalAttribute.byteOffset).toBe(0);
        expect(normalAttribute.byteStride).toBe(24);

        expect(positionAttribute.buffer).toBe(normalAttribute.buffer);
        expect(positionAttribute.buffer.sizeInBytes).toBe(576);
      });
    });

    function loadsBoxTextured(gltfPath) {
      return loadGltf(gltfPath).then(function (components) {
        var scene = components.scene;
        var nodes = components.nodes;
        var rootNode = scene.nodes[0];
        var childNode = rootNode.children[0];
        var primitive = childNode.primitives[0];
        var attributes = primitive.attributes;
        var positionAttribute = getAttribute(attributes, "POSITION");
        var normalAttribute = getAttribute(attributes, "NORMAL");
        var texcoordAttribute = getAttribute(attributes, "TEXCOORD_0");

        var indices = primitive.indices;
        var material = primitive.material;
        var metallicRoughness = material.metallicRoughness;

        // prettier-ignore
        var rootMatrix = new Matrix4(
          1.0, 0.0, 0.0, 0.0,
          0.0, 0.0, 1.0, 0.0,
          0.0, -1.0, 0.0, 0.0,
          0.0, 0.0, 0.0, 1.0
        );

        var childMatrix = Matrix4.IDENTITY;

        expect(rootNode.children.length).toBe(1);
        expect(rootNode.primitives.length).toBe(0);
        expect(rootNode.matrix).toEqual(rootMatrix);
        expect(rootNode.translation).toBeUndefined();
        expect(rootNode.rotation).toBeUndefined();
        expect(rootNode.scale).toBeUndefined();

        expect(childNode.children.length).toBe(0);
        expect(childNode.primitives.length).toBe(1);
        expect(childNode.matrix).toEqual(childMatrix);
        expect(childNode.translation).toBeUndefined();
        expect(childNode.rotation).toBeUndefined();
        expect(childNode.scale).toBeUndefined();

        expect(primitive.attributes.length).toBe(3);
        expect(primitive.primitiveType).toBe(PrimitiveType.TRIANGLES);

        expect(positionAttribute.semantic).toBe("POSITION");
        expect(positionAttribute.componentDatatype).toBe(
          ComponentDatatype.FLOAT
        );
        expect(positionAttribute.type).toBe(AttributeType.VEC3);
        expect(positionAttribute.normalized).toBe(false);
        expect(positionAttribute.count).toBe(24);
        expect(positionAttribute.min).toEqual(new Cartesian3(-0.5, -0.5, -0.5));
        expect(positionAttribute.max).toEqual(new Cartesian3(0.5, 0.5, 0.5));
        expect(positionAttribute.constant).toEqual(Cartesian3.ZERO);
        expect(positionAttribute.quantization).toBeUndefined();
        expect(positionAttribute.typedArray).toBeUndefined();
        expect(positionAttribute.buffer).toBeDefined();
        expect(positionAttribute.byteOffset).toBe(288);
        expect(positionAttribute.byteStride).toBe(12);

        expect(normalAttribute.semantic).toBe("NORMAL");
        expect(normalAttribute.componentDatatype).toBe(ComponentDatatype.FLOAT);
        expect(normalAttribute.type).toBe(AttributeType.VEC3);
        expect(normalAttribute.normalized).toBe(false);
        expect(normalAttribute.count).toBe(24);
        expect(normalAttribute.min).toEqual(new Cartesian3(-1.0, -1.0, -1.0));
        expect(normalAttribute.max).toEqual(new Cartesian3(1.0, 1.0, 1.0));
        expect(normalAttribute.constant).toEqual(Cartesian3.ZERO);
        expect(normalAttribute.quantization).toBeUndefined();
        expect(normalAttribute.typedArray).toBeUndefined();
        expect(normalAttribute.buffer).toBeDefined();
        expect(normalAttribute.byteOffset).toBe(0);
        expect(normalAttribute.byteStride).toBe(12);

        expect(texcoordAttribute.semantic).toBe("TEXCOORD_0");
        expect(texcoordAttribute.componentDatatype).toBe(
          ComponentDatatype.FLOAT
        );
        expect(texcoordAttribute.type).toBe(AttributeType.VEC2);
        expect(texcoordAttribute.normalized).toBe(false);
        expect(texcoordAttribute.count).toBe(24);
        expect(texcoordAttribute.min).toEqual(new Cartesian2(0.0, 0.0));
        expect(texcoordAttribute.max).toEqual(new Cartesian2(6.0, 1.0));
        expect(texcoordAttribute.constant).toEqual(Cartesian2.ZERO);
        expect(texcoordAttribute.quantization).toBeUndefined();
        expect(texcoordAttribute.typedArray).toBeUndefined();
        expect(texcoordAttribute.buffer).toBeDefined();
        expect(texcoordAttribute.byteOffset).toBe(0);
        expect(texcoordAttribute.byteStride).toBe(8);

        expect(indices.indexDatatype).toBe(IndexDatatype.UNSIGNED_SHORT);
        expect(indices.count).toBe(36);
        expect(indices.buffer).toBeDefined();
        expect(indices.buffer.sizeInBytes).toBe(72);

        expect(positionAttribute.buffer).toBe(normalAttribute.buffer);
        expect(positionAttribute.buffer).not.toBe(texcoordAttribute.buffer);

        expect(positionAttribute.buffer.sizeInBytes).toBe(576);
        expect(texcoordAttribute.buffer.sizeInBytes).toBe(192);

        expect(metallicRoughness.baseColorFactor).toEqual(
          new Cartesian4(1.0, 1.0, 1.0, 1.0)
        );
        expect(metallicRoughness.metallicFactor).toBe(0.0);
        expect(metallicRoughness.roughnessFactor).toBe(1.0);
        console.log(metallicRoughness.baseColorTexture);
        expect(metallicRoughness.baseColorTexture.texture.width).toBe(256);
        expect(metallicRoughness.baseColorTexture.texture.height).toBe(256);
        expect(metallicRoughness.baseColorTexture.texCoord).toBe(0);

        var sampler = metallicRoughness.baseColorTexture.sampler;
        expect(sampler.wrapS).toBe(TextureWrap.REPEAT);
        expect(sampler.wrapT).toBe(TextureWrap.REPEAT);
        expect(sampler.magnificationFilter).toBe(
          TextureMagnificationFilter.LINEAR
        );
        expect(sampler.minificationFilter).toBe(
          TextureMinificationFilter.NEAREST_MIPMAP_LINEAR
        );

        expect(nodes.length).toBe(2);
        expect(scene.nodes.length).toBe(1);
      });
    }

    it("loads BoxTextured", function () {
      return loadsBoxTextured(boxTextured);
    });

    it("loads BoxTexturedBinary", function () {
      return loadsBoxTextured(boxTexturedBinary);
    });

    it("loads BoxTexturedEmbedded", function () {
      return loadsBoxTextured(boxTexturedEmbedded);
    });

    it("loads BoxVertexColors", function () {
      return loadGltf(boxVertexColors).then(function (components) {
        var scene = components.scene;
        var rootNode = scene.nodes[0];
        var childNode = rootNode.children[1];
        var primitive = childNode.primitives[0];
        var attributes = primitive.attributes;
        var positionAttribute = getAttribute(attributes, "POSITION");
        var normalAttribute = getAttribute(attributes, "NORMAL");
        var texcoordAttribute = getAttribute(attributes, "TEXCOORD_0");
        var colorAttribute = getAttribute(attributes, "COLOR_0");

        expect(positionAttribute.buffer).toBeDefined();
        expect(positionAttribute.byteOffset).toBe(0);
        expect(positionAttribute.byteStride).toBe(12);

        expect(normalAttribute.buffer).toBeDefined();
        expect(normalAttribute.byteOffset).toBe(0);
        expect(normalAttribute.byteStride).toBe(12);

        expect(texcoordAttribute.buffer).toBeDefined();
        expect(texcoordAttribute.byteOffset).toBe(0);
        expect(texcoordAttribute.byteStride).toBe(8);

        expect(colorAttribute.semantic).toBe("COLOR_0");
        expect(colorAttribute.componentDatatype).toBe(ComponentDatatype.FLOAT);
        expect(colorAttribute.type).toBe(AttributeType.VEC4);
        expect(colorAttribute.normalized).toBe(false);
        expect(colorAttribute.count).toBe(24);
        expect(colorAttribute.min).toBeUndefined();
        expect(colorAttribute.max).toBeUndefined();
        expect(colorAttribute.constant).toEqual(Cartesian4.ZERO);
        expect(colorAttribute.quantization).toBeUndefined();
        expect(colorAttribute.typedArray).toBeUndefined();
        expect(colorAttribute.buffer).toBeDefined();
        expect(colorAttribute.byteOffset).toBe(0);
        expect(colorAttribute.byteStride).toBe(16);

        expect(colorAttribute.buffer.sizeInBytes).toBe(384);
      });
    });

    it("loads SimpleMorph", function () {
      return loadGltf(simpleMorph).then(function (components) {
        var scene = components.scene;
        var rootNode = scene.nodes[0];
        var primitive = rootNode.primitives[0];
        var attributes = primitive.attributes;
        var positionAttribute = getAttribute(attributes, "POSITION");
        var morphTargets = primitive.morphTargets;
        var morphTarget0 = morphTargets[0];
        var morphTarget1 = morphTargets[1];
        var morphPositions0 = getAttribute(morphTarget0.attributes, "POSITION");
        var morphPositions1 = getAttribute(morphTarget1.attributes, "POSITION");

        expect(morphPositions0.semantic).toBe("POSITION");
        expect(morphPositions0.componentDatatype).toBe(ComponentDatatype.FLOAT);
        expect(morphPositions0.type).toBe(AttributeType.VEC3);
        expect(morphPositions0.normalized).toBe(false);
        expect(morphPositions0.count).toBe(3);
        expect(morphPositions0.min).toEqual(new Cartesian3(-1.0, 0.0, 0.0));
        expect(morphPositions0.max).toEqual(new Cartesian3(0.0, 1.0, 0.0));
        expect(morphPositions0.constant).toEqual(Cartesian3.ZERO);
        expect(morphPositions0.quantization).toBeUndefined();
        expect(morphPositions0.typedArray).toBeUndefined();
        expect(morphPositions0.buffer).toBeDefined();
        expect(morphPositions0.byteOffset).toBe(36);
        expect(morphPositions0.byteStride).toBe(12);

        expect(morphPositions1.semantic).toBe("POSITION");
        expect(morphPositions1.componentDatatype).toBe(ComponentDatatype.FLOAT);
        expect(morphPositions1.type).toBe(AttributeType.VEC3);
        expect(morphPositions1.normalized).toBe(false);
        expect(morphPositions1.count).toBe(3);
        expect(morphPositions1.min).toEqual(new Cartesian3(0.0, 0.0, 0.0));
        expect(morphPositions1.max).toEqual(new Cartesian3(1.0, 1.0, 0.0));
        expect(morphPositions1.constant).toEqual(Cartesian3.ZERO);
        expect(morphPositions1.quantization).toBeUndefined();
        expect(morphPositions1.typedArray).toBeUndefined();
        expect(morphPositions1.buffer).toBeDefined();
        expect(morphPositions1.byteOffset).toBe(72);
        expect(morphPositions1.byteStride).toBe(12);

        expect(positionAttribute.buffer).toBe(morphPositions0.buffer);
        expect(positionAttribute.buffer).toBe(morphPositions1.buffer);
        expect(positionAttribute.buffer.sizeInBytes).toBe(108);

        expect(primitive.morphWeights).toEqual([0.5, 0.5]);
      });
    });

    it("loads SimpleSkin", function () {
      return loadGltf(simpleSkin).then(function (components) {});
    });

    // it("loads TriangleWithoutIndices", function () {
    //   return loadGltf(triangleWithoutIndices).then(function (components) {});
    // });

    // it("loads TwoSidedPlane", function () {
    //   return loadGltf(twoSidedPlane).then(function (components) {});
    // });

    // it("loads UnlitTest", function () {
    //   return loadGltf(unlitTest).then(function (components) {});
    // });
  },
  "WebGL"
);
