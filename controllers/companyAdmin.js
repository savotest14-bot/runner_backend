const Contract = require("../models/contract");
const { getFileUrl } = require("../functions/common");

// Clients


exports.getAllClientsForCompanyAdmin = async (req, res) => {
    try {
        const user = req.user;

        if (user.role.name !== "company_admin") {
            return res.status(403).json({
                message: "Only company admin can access clients",
            });
        }

        const contracts = await Contract.find({
            company: user.company,
            isDeleted: false,
        })
            .populate("client")
            .select("client")
            .lean();

        if (!contracts.length) {
            return res.status(200).json({
                success: true,
                data: [],
            });
        }

        const clientMap = new Map();

        contracts.forEach(({ _id: contractId, client }) => {
            if (!client || client.isDeleted) return;

            const clientId = client._id.toString();

            if (!clientMap.has(clientId)) {
                clientMap.set(clientId, {
                    _id: client._id,
                    name: client.name,
                    email: client.email,
                    phone: client.phone,
                    addressLine1: client.addressLine1,
                    addressLine2: client.addressLine2,
                    city: client.city,
                    state: client.state,
                    country: client.country,
                    pincode: client.pincode,
                    clientLogo: client.clientLogo,
                    contractIds: [],
                    createdAt: client.createdAt,
                });
            }

            clientMap.get(clientId).contractIds.push(contractId);
        });

        const result = Array.from(clientMap.values()).map((client) => {
            if (client.clientLogo) {
                client.clientLogo = getFileUrl(req, client.clientLogo);
            }
            return client;
        });

        return res.status(200).json({
            success: true,
            totalClients: result.length,
            data: result,
        });
    } catch (error) {
        console.error("Get all clients error:", error);
        return res.status(500).json({
            message: "Failed to fetch clients",
        });
    }
};


// Property

exports.getAllPropertiesForCompanyAdmin = async (req, res) => {
  try {
    const user = req.user;

    if (user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company admin can access properties",
      });
    }

    const contracts = await Contract.find({
      company: user.company,
      isDeleted: false,
    })
      .populate("property")
      .populate("client")
      .select("property client")
      .lean();

    if (!contracts.length) {
      return res.status(200).json({
        success: true,
        totalProperties: 0,
        data: [],
      });
    }

    const propertyMap = new Map();

    contracts.forEach(({ _id: contractId, property, client }) => {
      if (!property || property.isDeleted) return;
      if (!client || client.isDeleted) return;

      const propertyId = property._id.toString();

      if (!propertyMap.has(propertyId)) {
        propertyMap.set(propertyId, {
          _id: property._id,
          propertyName: property.propertyName,
          propertyType: property.propertyType,
          description: property.description,
          sizeSqm: property.sizeSqm,
          noOfResidents: property.noOfResidents,
          specialFeatureEndDate: property.specialFeatureEndDate,

          client: {
            _id: client._id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            city: client.city,
            country: client.country,
            clientLogo: client.clientLogo,
          },

          contractIds: [],
          createdAt: property.createdAt,
        });
      }

      propertyMap.get(propertyId).contractIds.push(contractId);
    });

    const result = Array.from(propertyMap.values()).map((property) => {
      if (property.client?.clientLogo) {
        property.client.clientLogo = getFileUrl(
          req,
          property.client.clientLogo
        );
      }
      return property;
    });

    return res.status(200).json({
      success: true,
      totalProperties: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Get all properties error:", error);
    return res.status(500).json({
      message: "Failed to fetch properties",
    });
  }
};

