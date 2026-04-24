const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
  {
    propertyName: {
      type: String,
      required: true,
    },
    propertyType: {
      type: String,
      enum: ["house", "apartment", "commercial", "residential", "other"],
    },
    description: String,

    sizeSqm: Number,
    noOfResidents: Number,

    specialFeatureEndDate: Date,

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    // ✅ ADD THIS
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: String, // optional
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);
propertySchema.index({ location: "2dsphere" });
module.exports = mongoose.model("Property", propertySchema);
