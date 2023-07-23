package helpers

type SdManagerType struct {
}

func (c *SdManagerType) GetAddrOfNodeId(nodeId string) string {
	// todo
	return nodeId
}

var SdManager *SdManagerType

func init() {
	SdManager = &SdManagerType{}
}
