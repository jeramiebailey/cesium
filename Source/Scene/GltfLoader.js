import Cartesian2 from "../Core/Cartesian2.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Cartesian4 from "../Core/Cartesian4.js";
import Check from "../Core/Check.js";
import ComponentDatatype from "../Core/ComponentDatatype.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import FeatureDetection from "../Core/FeatureDetection.js";
import Matrix2 from "../Core/Matrix2.js";
import Matrix3 from "../Core/Matrix3.js";
import Matrix4 from "../Core/Matrix4.js";
import Quaternion from "../Core/Quaternion.js";
import Sampler from "../Renderer/Sampler.js";
import getAccessorByteStride from "../ThirdParty/GltfPipeline/getAccessorByteStride.js";
import numberOfComponentsForType from "../ThirdParty/GltfPipeline/numberOfComponentsForType.js";
import when from "../ThirdParty/when.js";
import AttributeType from "./AttributeType.js";
import GltfFeatureMetadataLoader from "./GltfFeatureMetadataLoader.js";
import GltfLoaderUtil from "./GltfLoaderUtil.js";
import ModelComponents from "./ModelComponents.js";
import ResourceCache from "./ResourceCache.js";
import ResourceLoader from "./ResourceLoader.js";
import ResourceLoaderState from "./ResourceLoaderState.js";
import SupportedImageFormats from "./SupportedImageFormats.js";

var Attribute = ModelComponents.Attribute;
var Indices = ModelComponents.Indices;
var FeatureIdAttribute = ModelComponents.FeatureIdAttribute;
var FeatureIdTexture = ModelComponents.FeatureIdTexture;
var MorphTarget = ModelComponents.MorphTarget;
var Primitive = ModelComponents.Primitive;
var Instances = ModelComponents.Instances;
var Skin = ModelComponents.Skin;
var Node = ModelComponents.Node;
var Scene = ModelComponents.Scene;
var Components = ModelComponents.Components;
var Texture = ModelComponents.Texture;
var MetallicRoughness = ModelComponents.MetallicRoughness;
var SpecularGlossiness = ModelComponents.SpecularGlossiness;
var Material = ModelComponents.Material;

/**
 * Loads a glTF model.
 * <p>
 * Implements the {@link ResourceLoader} interface.
 * </p>
 *
 * @alias GltfLoader
 * @constructor
 * @augments ResourceLoader
 *
 * @param {Object} options Object with the following properties:
 * @param {Resource} options.gltfResource The {@link Resource} containing the glTF. This is often the path of the .gltf or .glb file, but may also be the path of the .b3dm, .i3dm, or .cmpt file containing the embedded glb. .cmpt resources should have a URI fragment indicating the index of the inner content to which the glb belongs in order to individually identify the glb in the cache, e.g. http://example.com/tile.cmpt#index=2.
 * @param {Resource} [options.baseResource] The {@link Resource} that paths in the glTF JSON are relative to.
 * @param {Uint8Array} [options.typedArray] The typed array containing the glTF contents, e.g. from a .b3dm, .i3dm, or .cmpt file.
 * @param {Boolean} [options.keepResident=false] Whether the glTF JSON and embedded buffers should stay in the cache indefinitely.
 * @param {Boolean} [options.asynchronous=true] Determines if WebGL resource creation will be spread out over several frames or block until all WebGL resources are created.
 * @param {Boolean} [options.incrementallyLoadTextures=true] Determine if textures may continue to stream in after the glTF is loaded.
 *
 * @private
 */
export default function GltfLoader(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);
  var gltfResource = options.gltfResource;
  var baseResource = options.baseResource;
  var typedArray = options.typedArray;
  var keepResident = defaultValue(options.keepResident, false);
  var asynchronous = defaultValue(options.asynchronous, true);
  var incrementallyLoadTextures = defaultValue(
    options.incrementallyLoadTextures,
    true
  );

  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("options.gltfResource", gltfResource);
  //>>includeEnd('debug');

  baseResource = defined(baseResource) ? baseResource : gltfResource.clone();

  this._gltfResource = gltfResource;
  this._baseResource = baseResource;
  this._typedArray = typedArray;
  this._keepResident = keepResident;
  this._asynchronous = asynchronous;
  this._incrementallyLoadTextures = incrementallyLoadTextures;
  this._gltfJsonLoader = undefined;
  this._state = ResourceLoaderState.UNLOADED;
  this._promise = when.defer();

  // Loaders that need to be processed before the glTF becomes ready
  this._loaders = [];

  // Loaded results
  this._components = undefined;
}

if (defined(Object.create)) {
  GltfLoader.prototype = Object.create(ResourceLoader.prototype);
  GltfLoader.prototype.constructor = GltfLoader;
}

Object.defineProperties(GltfLoader.prototype, {
  /**
   * A promise that resolves to the resource when the resource is ready.
   *
   * @memberof GltfLoader.prototype
   *
   * @type {Promise.<GltfLoader>}
   * @readonly
   */
  promise: {
    get: function () {
      return this._promise.promise;
    },
  },
  /**
   * The cache key of the resource.
   *
   * @memberof GltfLoader.prototype
   *
   * @type {String}
   * @readonly
   */
  cacheKey: {
    get: function () {
      return undefined;
    },
  },
  /**
   * The loaded components.
   *
   * @memberof GltfLoader.prototype
   *
   * @type {ModelComponents.Components}
   * @readonly
   */
  components: {
    get: function () {
      return this._components;
    },
  },
});

/**
 * Loads the resource.
 */
GltfLoader.prototype.load = function () {
  var gltfJsonLoader = ResourceCache.loadGltf({
    gltfResource: this._gltfResource,
    baseResource: this._baseResource,
    typedArray: this._typedArray,
    keepResident: this._keepResident,
  });

  this._gltfJsonLoader = gltfJsonLoader;
  this._state = ResourceLoaderState.LOADING;

  var that = this;
  gltfJsonLoader.promise
    .then(function () {
      if (that.isDestroyed()) {
        return;
      }
      that._state = ResourceLoaderState.PROCESSING;
    })
    .otherwise(function (error) {
      if (that.isDestroyed()) {
        return;
      }
      handleError(that, error);
    });
};

function handleError(gltfLoader, error) {
  gltfLoader.unload();
  gltfLoader._state = ResourceLoaderState.FAILED;
  var errorMessage = "Failed to load glTF";
  error = gltfLoader.getError(errorMessage, error);
  gltfLoader._promise.reject(error);
}

/**
 * Processes the resource until it becomes ready.
 *
 * @param {FrameState} frameState The frame state.
 */
GltfLoader.prototype.process = function (frameState) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("frameState", frameState);
  //>>includeEnd('debug');

  if (this._state !== ResourceLoaderState.PROCESSING) {
    return;
  }

  if (!FeatureDetection.supportsWebP.initialized) {
    FeatureDetection.supportsWebP.initialize();
    return;
  }

  var gltfJsonLoader = this._gltfJsonLoader;
  if (defined(gltfJsonLoader)) {
    // Parse the glTF
    var supportedImageFormats = new SupportedImageFormats({
      webp: FeatureDetection.supportsWebP(),
      s3tc: frameState.context.s3tc,
      pvrtc: frameState.context.pvrtc,
      etc1: frameState.context.etc1,
    });
    var gltf = gltfJsonLoader.gltf;
    parse(this, gltf, supportedImageFormats, frameState);
    ResourceCache.unload(gltfJsonLoader);
    this._gltfJsonLoader = undefined;
  }

  var loaders = this._loaders;
  var loadersLength = loaders.length;
  for (var i = 0; i < loadersLength; ++i) {
    loaders[i].process(frameState);
  }
};

function loadVertexBuffer(loader, gltf, accessorId, semantic, draco) {
  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;

  var vertexBufferLoader = ResourceCache.loadVertexBuffer({
    gltf: gltf,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    bufferViewId: bufferViewId,
    draco: draco,
    dracoAttributeSemantic: semantic,
    keepResident: false,
    asynchronous: loader._asynchronous,
  });

  loader._loaders.push(vertexBufferLoader);

  return vertexBufferLoader;
}

function loadIndexBuffer(loader, gltf, accessorId, draco) {
  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;

  if (!defined(draco) && !defined(bufferViewId)) {
    return undefined;
  }

  var indexBufferLoader = ResourceCache.loadIndexBuffer({
    gltf: gltf,
    accessorId: accessorId,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    draco: draco,
    keepResident: false,
    asynchronous: loader._asynchronous,
  });

  loader._loaders.push(indexBufferLoader);

  return indexBufferLoader;
}

function loadBufferView(loader, gltf, bufferViewId) {
  var bufferViewLoader = ResourceCache.loadBufferView({
    gltf: gltf,
    bufferViewId: bufferViewId,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    keepResident: false,
  });

  loader._loaders.push(bufferViewLoader);

  return bufferViewLoader;
}

function getAccessorTypedArray(gltf, accessor, bufferViewTypedArray) {
  var byteOffset = accessor.byteOffset;
  var byteStride = getAccessorByteStride(gltf, accessor);
  var count = accessor.count;
  var componentCount = numberOfComponentsForType(accessor.type);
  var componentType = accessor.componentType;
  var componentByteLength = ComponentDatatype.getSizeInBytes(componentType);
  var defaultByteStride = componentByteLength * componentCount;
  var componentStride = byteStride / componentByteLength;
  var componentsLength = count * componentCount;

  var componentsTypedArray = ComponentDatatype.createArrayBufferView(
    componentType,
    bufferViewTypedArray.buffer,
    bufferViewTypedArray.byteOffset + byteOffset,
    componentStride * componentsLength
  );

  if (byteStride === defaultByteStride) {
    return componentsTypedArray;
  }

  var accessorTypedArray = ComponentDatatype.createTypedArray(
    componentType,
    componentsLength
  );

  for (var i = 0; i < count; ++i) {
    for (var j = 0; j < componentCount; ++j) {
      accessorTypedArray[i * count + j] =
        componentsTypedArray[i * componentStride + j];
    }
  }

  return accessorTypedArray;
}

function loadSkin(loader, gltf, gltfSkin, nodes) {
  var skin = new Skin();

  var jointIds = gltfSkin.joints;
  var jointsLength = jointIds.length;
  var joints = new Array(jointsLength);
  for (var i = 0; i < jointsLength; ++i) {
    joints[i] = nodes[jointIds[i]];
  }
  skin.joints = joints;

  var inverseBindMatricesAccessorId = skin.inverseBindMatrices;
  if (defined(inverseBindMatricesAccessorId)) {
    var accessor = gltf.accessors[inverseBindMatricesAccessorId];
    var bufferViewId = accessor.bufferView;
    if (defined(bufferViewId)) {
      var bufferViewLoader = loadBufferView(loader, gltf, bufferViewId);
      bufferViewLoader.promise.then(function (bufferViewLoader) {
        if (loader.isDestroyed()) {
          return;
        }
        var bufferViewTypedArray = bufferViewLoader.typedArray;
        var accessorTypedArray = getAccessorTypedArray(
          gltf,
          accessor,
          bufferViewTypedArray
        );
        var inverseBindMatrices = new Array(jointsLength);
        for (var i = 0; i < jointsLength; ++i) {
          inverseBindMatrices[i] = Matrix4.unpack(accessorTypedArray, i * 16);
        }
        skin.inverseBindMatrices = inverseBindMatrices;
      });
    }
  } else {
    skin.inverseBindMatrices = new Array(jointsLength).fill(Matrix4.IDENTITY);
  }
}

function getMathType(type) {
  switch (type) {
    case AttributeType.SCALAR:
      return Number;
    case AttributeType.VEC2:
      return Cartesian2;
    case AttributeType.VEC3:
      return Cartesian3;
    case AttributeType.VEC4:
      return Cartesian4;
    case AttributeType.MAT2:
      return Matrix2;
    case AttributeType.MAT3:
      return Matrix3;
    case AttributeType.MAT4:
      return Matrix4;
  }
}

function fromArray(MathType, values) {
  if (!defined(values)) {
    return undefined;
  }

  if (MathType === Number) {
    return values;
  }

  return MathType.unpack(values);
}

function getDefault(MathType) {
  if (MathType === Number) {
    return 0.0;
  }

  return new MathType(); // defaults to 0.0 for all types
}

function createAttribute(gltf, accessorId, semantic) {
  var accessor = gltf.accessors[accessorId];
  var MathType = getMathType(accessor.type);

  var attribute = new Attribute();
  attribute.semantic = semantic;
  attribute.constant = getDefault(MathType);
  attribute.componentDatatype = accessor.componentType;
  attribute.normalized = accessor.normalized;
  attribute.count = accessor.count;
  attribute.type = accessor.type;
  attribute.min = fromArray(MathType, accessor.min);
  attribute.max = fromArray(MathType, accessor.max);
  attribute.byteOffset = accessor.byteOffset;
  attribute.byteStride = getAccessorByteStride(gltf, accessor);

  return attribute;
}

function loadVertexAttribute(loader, gltf, accessorId, semantic, draco) {
  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;

  var attribute = createAttribute(gltf, accessorId, semantic);

  if (!defined(draco) && !defined(bufferViewId)) {
    return attribute;
  }

  var vertexBufferLoader = loadVertexBuffer(
    loader,
    gltf,
    accessorId,
    semantic,
    draco
  );
  vertexBufferLoader.promise.then(function (vertexBufferLoader) {
    if (loader.isDestroyed()) {
      return;
    }

    attribute.buffer = vertexBufferLoader.vertexBuffer;

    if (
      defined(draco) &&
      defined(draco.attributes) &&
      defined(draco.attributes[semantic])
    ) {
      // The accessor's byteOffset and byteStride should be ignored for draco.
      // Each attribute is tightly packed in its own buffer after decode.
      attribute.byteOffset = 0;
      attribute.byteStride = undefined;

      // Update the attribute with the quantization information
      var quantization = vertexBufferLoader.quantization;
      attribute.componentDatatype = quantization.componentDatatype;

      if (quantization.octEncoded) {
        attribute.type = AttributeType.VEC2;
      }

      attribute.quantization = vertexBufferLoader.quantization;
    }
  });

  return attribute;
}

function loadInstancedAttribute(
  loader,
  gltf,
  accessorId,
  semantic,
  frameState
) {
  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;

  var attribute = createAttribute(gltf, accessorId, semantic);

  if (!defined(bufferViewId)) {
    return attribute;
  }

  if (frameState.context.instancedArrays) {
    // Only create a GPU buffer if the browser supports WebGL instancing
    // Don't pass in draco object since instanced attributes can't be draco compressed
    var vertexBufferLoader = loadVertexBuffer(
      loader,
      gltf,
      accessorId,
      semantic,
      undefined
    );
    vertexBufferLoader.promise.then(function (vertexBufferLoader) {
      if (loader.isDestroyed()) {
        return;
      }
      attribute.buffer = vertexBufferLoader.vertexBuffer;
    });
    return attribute;
  }

  var bufferViewLoader = loadBufferView(loader, gltf, bufferViewId);
  bufferViewLoader.promise.then(function (bufferViewLoader) {
    if (loader.isDestroyed()) {
      return;
    }
    var bufferViewTypedArray = bufferViewLoader.typedArray;
    var accessorTypedArray = getAccessorTypedArray(
      gltf,
      accessor,
      bufferViewTypedArray
    );
    attribute.typedArray = accessorTypedArray;
  });

  return attribute;
}

function loadIndices(loader, gltf, accessorId, draco) {
  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;

  if (!defined(draco) && !defined(bufferViewId)) {
    return undefined;
  }

  var indices = new Indices();
  indices.indexDatatype = accessor.componentType;
  indices.count = accessor.count;

  var indexBufferLoader = loadIndexBuffer(loader, gltf, accessorId, draco);
  indexBufferLoader.promise.then(function (indexBufferLoader) {
    if (loader.isDestroyed()) {
      return;
    }
    indices.buffer = indexBufferLoader.indexBuffer;
  });

  return indices;
}

function loadTexture(loader, gltf, textureInfo, supportedImageFormats) {
  var imageId = GltfLoaderUtil.getImageIdFromTexture({
    gltf: gltf,
    textureId: textureInfo.index,
    supportedImageFormats: supportedImageFormats,
  });

  if (!defined(imageId)) {
    return undefined;
  }

  var textureLoader = ResourceCache.loadTexture({
    gltf: gltf,
    textureInfo: textureInfo,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    supportedImageFormats: supportedImageFormats,
    keepResident: false,
    asynchronous: loader._asynchronous,
  });

  loader._loaders.push(textureLoader);

  var texture = new Texture();
  texture.texCoord = textureInfo.texCoord;
  texture.sampler = GltfLoaderUtil.createSampler({
    gltf: gltf,
    textureInfo: textureInfo,
  });

  textureLoader.promise.then(function (textureLoader) {
    if (loader.isDestroyed()) {
      return;
    }
    texture.texture = textureLoader.texture;
  });

  return texture;
}

function loadMaterial(loader, gltf, gltfMaterial, supportedImageFormats) {
  var material = new Material();

  // Metallic roughness
  var pbrMetallicRoughness = gltfMaterial.pbrMetallicRoughness;
  if (defined(pbrMetallicRoughness)) {
    var metallicRoughness = new MetallicRoughness();
    material.metallicRoughness = metallicRoughness;

    if (defined(pbrMetallicRoughness.baseColorTexture)) {
      metallicRoughness.baseColorTexture = loadTexture(
        loader,
        gltf,
        pbrMetallicRoughness.baseColorTexture,
        supportedImageFormats
      );
    }
    if (defined(pbrMetallicRoughness.metallicRoughnessTexture)) {
      metallicRoughness.metallicRoughnessTexture = loadTexture(
        loader,
        gltf,
        pbrMetallicRoughness.metallicRoughnessTexture,
        supportedImageFormats
      );
    }
    metallicRoughness.baseColorFactor = fromArray(
      Cartesian4,
      pbrMetallicRoughness.baseColorFactor
    );
    metallicRoughness.metallicFactor = pbrMetallicRoughness.metallicFactor;
    metallicRoughness.roughnessFactor = pbrMetallicRoughness.roughnessFactor;
  }

  if (defined(material.extensions)) {
    // Spec gloss extension
    var pbrSpecularGlossiness =
      material.extensions.KHR_materials_pbrSpecularGlossiness;
    if (defined(pbrSpecularGlossiness)) {
      var specularGlossiness = new SpecularGlossiness();
      material.specularGlossiness = specularGlossiness;

      if (defined(pbrSpecularGlossiness.diffuseTexture)) {
        specularGlossiness.diffuseTexture = loadTexture(
          loader,
          gltf,
          pbrSpecularGlossiness.diffuseTexture,
          supportedImageFormats
        );
      }
      if (defined(pbrSpecularGlossiness.specularGlossinessTexture)) {
        if (defined(pbrSpecularGlossiness.specularGlossinessTexture)) {
          specularGlossiness.specularGlossinessTexture = loadTexture(
            loader,
            gltf,
            pbrSpecularGlossiness.specularGlossinessTexture,
            supportedImageFormats
          );
        }
      }
      specularGlossiness.diffuseFactor = fromArray(
        Cartesian4,
        pbrSpecularGlossiness.diffuseFactor
      );
      specularGlossiness.specularFactor = fromArray(
        Cartesian3,
        pbrSpecularGlossiness.specularFactor
      );
      specularGlossiness.glossinessFactor =
        pbrSpecularGlossiness.glossinessFactor;
    }
  }

  // Top level textures
  if (defined(material.emissiveTexture)) {
    material.emissiveTexture = loadTexture(
      loader,
      gltf,
      material.emissiveTexture,
      supportedImageFormats
    );
  }
  if (defined(material.normalTexture)) {
    material.normalTexture = loadTexture(
      loader,
      gltf,
      material.normalTexture,
      supportedImageFormats
    );
  }
  if (defined(material.occlusionTexture)) {
    material.occlusionTexture = loadTexture(
      loader,
      gltf,
      material.occlusionTexture,
      supportedImageFormats
    );
  }
  material.emissiveFactor = fromArray(Cartesian3, gltfMaterial.emissiveFactor);
  material.alphaMode = gltfMaterial.alphaMode;
  material.alphaCutoff = gltfMaterial.alphaCutoff;
  material.doubleSided = gltfMaterial.doubleSided;

  return material;
}

function loadFeatureIdAttribute(gltfFeatureIdAttribute) {
  var featureIdAttribute = new FeatureIdAttribute();
  var featureIds = gltfFeatureIdAttribute.featureIds;
  featureIdAttribute.featureTableId = gltfFeatureIdAttribute.featureTable;
  featureIdAttribute.semantic = featureIds.attribute;
  featureIdAttribute.constant = featureIds.constant;
  featureIdAttribute.divisor = featureIds.divisor;
  return featureIdAttribute;
}

function loadFeatureIdTexture(
  loader,
  gltf,
  gltfFeatureIdTexture,
  supportedImageFormats
) {
  var featureIdTexture = new FeatureIdTexture();
  var featureIds = gltfFeatureIdTexture.featureIds;
  var textureInfo = featureIds.texture;

  featureIdTexture.featureTableId = gltfFeatureIdTexture.featureTable;
  featureIdTexture.channel = featureIds.channels;
  featureIdTexture.texture = loadTexture(
    loader,
    gltf,
    textureInfo,
    supportedImageFormats
  );

  // Feature ID textures require nearest sampling
  featureIdTexture.texture.sampler = Sampler.NEAREST;

  return featureIdTexture;
}

function loadMorphTarget(loader, gltf, target) {
  var morphTarget = new MorphTarget();

  for (var semantic in target) {
    if (target.hasOwnProperty(semantic)) {
      var accessorId = target[semantic];
      morphTarget.attributes.push(
        // Don't pass in draco object since morph targets can't be draco compressed
        loadVertexAttribute(loader, gltf, accessorId, semantic, undefined)
      );
    }
  }

  return morphTarget;
}

function loadPrimitive(
  loader,
  gltf,
  gltfPrimitive,
  morphWeights,
  supportedImageFormats
) {
  var i;

  var primitive = new Primitive();

  var materialId = gltfPrimitive.material;
  if (defined(materialId)) {
    primitive.material = loadMaterial(
      loader,
      gltf,
      gltf.materials[materialId],
      supportedImageFormats
    );
  }

  var extensions = defaultValue(
    gltfPrimitive.extensions,
    defaultValue.EMPTY_OBJECT
  );
  var draco = extensions.KHR_draco_mesh_compression;
  var featureMetadata = extensions.EXT_feature_metadata;

  var attributes = gltfPrimitive.attributes;
  if (defined(attributes)) {
    for (var semantic in attributes) {
      if (attributes.hasOwnProperty(semantic)) {
        var accessorId = attributes[semantic];
        primitive.attributes.push(
          loadVertexAttribute(loader, gltf, accessorId, semantic, draco)
        );
      }
    }
  }

  var targets = gltfPrimitive.targets;
  if (defined(targets)) {
    var targetsLength = targets.length;
    for (i = 0; i < targetsLength; ++i) {
      primitive.morphTargets.push(loadMorphTarget(loader, gltf, targets[i]));
    }
    primitive.morphWeights = defined(morphWeights)
      ? morphWeights.slice()
      : new Array(targetsLength).fill(0.0);
  }

  var indices = gltfPrimitive.indices;
  if (defined(indices)) {
    primitive.indices = loadIndices(loader, gltf, indices, draco);
  }

  if (defined(featureMetadata)) {
    // Feature ID Attributes
    var featureIdAttributes = featureMetadata.featureIdAttributes;
    if (defined(featureIdAttributes)) {
      var featureIdAttributesLength = featureIdAttributesLength;
      for (i = 0; i < featureIdAttributesLength; ++i) {
        primitive.featureIdAttributes.push(
          loadFeatureIdAttribute(featureIdAttributes[i])
        );
      }
    }

    // Feature ID Textures
    var featureIdTextures = featureMetadata.featureIdTextures;
    if (defined(featureIdTextures)) {
      var featureIdTexturesLength = featureIdTextures.length;
      for (i = 0; i < featureIdTexturesLength; ++i) {
        primitive.featureIdTextures.push(
          loadFeatureIdTexture(
            loader,
            gltf,
            featureIdTextures[i],
            supportedImageFormats
          )
        );
      }
    }

    // Feature Textures
    primitive.featureTexturesIds = featureMetadata.featureTextures;
  }

  primitive.primitiveType = gltfPrimitive.mode;

  return primitive;
}

function loadInstances(loader, gltf, instancingExtension, frameState) {
  var instances = new Instances();
  var attributes = instancingExtension.attributes;
  if (defined(attributes)) {
    for (var semantic in attributes) {
      if (attributes.hasOwnProperty(semantic)) {
        var accessorId = attributes[semantic];
        instances.attributes.push(
          loadInstancedAttribute(loader, gltf, accessorId, semantic, frameState)
        );
      }
    }
  }

  var extensions = defaultValue(
    instancingExtension.extensions,
    defaultValue.EMPTY_OBJECT
  );
  var featureMetadata = extensions.EXT_feature_metadata;
  if (defined(featureMetadata)) {
    var featureIdAttributes = featureMetadata.featureIdAttributes;
    if (defined(featureIdAttributes)) {
      var featureIdAttributesLength = featureIdAttributesLength;
      for (var i = 0; i < featureIdAttributesLength; ++i) {
        instances.featureIdAttributes.push(
          loadFeatureIdAttribute(featureIdAttributes[i])
        );
      }
    }
  }
  return instances;
}

function loadNode(loader, gltf, gltfNode, supportedImageFormats, frameState) {
  var node = new Node();

  node.matrix = fromArray(Matrix4, gltfNode.matrix);
  node.translation = fromArray(Cartesian3, gltfNode.translation);
  node.rotation = fromArray(Quaternion, gltfNode.rotation);
  node.scale = fromArray(Cartesian3, gltfNode.scale);

  var meshId = gltfNode.mesh;
  if (defined(meshId)) {
    var mesh = gltf.meshes[meshId];
    var morphWeights = defaultValue(gltfNode.weights, mesh.weights);
    var primitives = mesh.primitives;
    var primitivesLength = primitives.length;
    for (var i = 0; i < primitivesLength; ++i) {
      node.primitives.push(
        loadPrimitive(
          loader,
          gltf,
          primitives[i],
          morphWeights,
          supportedImageFormats
        )
      );
    }
  }

  var extensions = defaultValue(node.extensions, defaultValue.EMPTY_OBJECT);
  var instancingExtension = extensions.EXT_mesh_gpu_instancing;
  if (defined(instancingExtension)) {
    node.instances = loadInstances(
      loader,
      gltf,
      instancingExtension,
      frameState
    );
  }

  return node;
}

function loadNodes(loader, gltf, supportedImageFormats, frameState) {
  var i;
  var j;

  var nodesLength = gltf.nodes.length;
  var nodes = new Array(nodesLength);
  for (i = 0; i < nodesLength; ++i) {
    nodes[i] = loadNode(
      loader,
      gltf,
      gltf.nodes[i],
      supportedImageFormats,
      frameState
    );
  }

  for (i = 0; i < nodesLength; ++i) {
    var childrenNodeIds = gltf.nodes[i].children;
    if (defined(childrenNodeIds)) {
      var childrenLength = childrenNodeIds.length;
      for (j = 0; j < childrenLength; ++j) {
        nodes[i].children.push(nodes[childrenNodeIds[j]]);
      }
    }
  }

  for (i = 0; i < nodesLength; ++i) {
    var skinId = gltf.nodes[i].skin;
    if (defined(skinId)) {
      nodes[i].skin = loadSkin(loader, gltf, gltf.skins[skinId], nodes);
    }
  }

  return nodes;
}

function loadFeatureMetadata(loader, gltf, extension, supportedImageFormats) {
  var featureMetadataLoader = new GltfFeatureMetadataLoader({
    gltf: gltf,
    extension: extension,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    supportedImageFormats: supportedImageFormats,
    asynchronous: loader._asynchronous,
  });
  featureMetadataLoader.load();

  loader._loaders.push(featureMetadataLoader);

  return featureMetadataLoader;
}

function getSceneNodeIds(gltf) {
  var nodesIds;
  if (defined(gltf.scenes) && defined(gltf.scene)) {
    nodesIds = gltf.scenes[gltf.scene].nodes;
  }
  nodesIds = defaultValue(nodesIds, gltf.nodes);
  nodesIds = defined(nodesIds) ? nodesIds : [];
  return nodesIds;
}

function loadScene(gltf, nodes) {
  var scene = new Scene();
  var sceneNodeIds = getSceneNodeIds(gltf);
  scene.nodes = sceneNodeIds.map(function (sceneNodeId) {
    return nodes[sceneNodeId];
  });
  return scene;
}

function parse(loader, gltf, supportedImageFormats, frameState) {
  var nodes = loadNodes(loader, gltf, supportedImageFormats, frameState);
  var scene = loadScene(gltf, nodes);

  var components = new Components();
  components.scene = scene;
  components.nodes = nodes;

  loader._components = components;

  // Load feature metadata (feature tables and feature textures)
  var extensions = defaultValue(gltf.extensions, defaultValue.EMPTY_OBJECT);
  var featureMetadataExtension = extensions.EXT_feature_metadata;
  if (defined(featureMetadataExtension)) {
    var featureMetadataLoader = loadFeatureMetadata(
      loader,
      gltf,
      featureMetadataExtension,
      supportedImageFormats
    );
    featureMetadataLoader.then(function (featureMetadataLoader) {
      if (loader.isDestroyed()) {
        return;
      }
      components.featureMetadata = featureMetadataLoader.featureMetadata;
    });
  }

  // Gather promises and reject if any promises fail
  var promises = loader._loaders.map(function (loader) {
    return loader.promise;
  });

  when
    .all(promises)
    .then(function () {
      if (loader.isDestroyed()) {
        return;
      }
      loader._state = ResourceLoaderState.READY;
      loader._promise.resolve(loader);
    })
    .otherwise(function (error) {
      if (loader.isDestroyed()) {
        return;
      }
      handleError(loader, error);
    });
}

/**
 * Unloads the resource.
 */
GltfLoader.prototype.unload = function () {
  if (defined(this._gltfJsonLoader)) {
    ResourceCache.unload(this._gltfJsonLoader);
  }
  this._gltfJsonLoader = undefined;

  var loaders = this._loaders;
  var loadersLength = loaders.length;
  for (var i = 0; i < loadersLength; ++i) {
    loaders[i].unload();
  }
  this._loaders = [];
};
